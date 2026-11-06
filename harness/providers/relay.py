"""Private Linux Unix HTTP bridge; deliberately not wired into Doom."""
import os
import re
import socket
import stat
import threading
import time
from http.client import HTTPSConnection

from .profiles import APIProfile, get_profile, resolve_api_key
from .transport import forward_request, TransportError, _REQUEST_LIMIT

_ERROR = b'{"error":"Provider request failed."}'


def _abort(sock):
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass


class _OwnedConnection:
    """Guard only this newly created connection, including implicit reconnects."""
    def __init__(self, relay, connection):
        self.relay, self.connection, self.captured = relay, connection, None
        connect = connection.connect

        def guarded_connect():
            self.check()
            connect()
            with relay._lock:
                self.captured = connection.sock
                if relay._stop.is_set():
                    _abort(self.captured)
                    raise TransportError(502)
            self.check()
        connection.connect = guarded_connect

    def check(self):
        if self.relay._stop.is_set():
            raise TransportError(502)

    @property
    def sock(self):
        return self.connection.sock

    def connect(self):
        self.connection.connect()

    def request(self, *args, **kwargs):
        self.check()
        self.connection.request(*args, **kwargs)
        self.check()

    def getresponse(self):
        self.check()
        return self.connection.getresponse()

    def close(self):
        try:
            self.connection.close()
        finally:
            with self.relay._lock:
                self.relay._upstreams.discard(self)


class ProviderRelay:
    """One-shot start/close, at most four clients; host_key is never logged."""
    def __init__(self, path, profile, host_key, *, connection_factory=HTTPSConnection):
        try:
            if type(profile) is not APIProfile:
                raise ValueError
            self._profile = get_profile(profile.provider, profile.model, region=profile.region)
            key = resolve_api_key(self._profile, {profile.key_env: host_key})
            if not key.isascii() or len(key) > 8192 or not callable(connection_factory):
                raise ValueError
            self._validate_path(path)
        except Exception:
            raise ValueError('Invalid relay configuration.') from None
        self._path, self._key, self._factory = path, key, connection_factory
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._clients, self._workers, self._upstreams = set(), set(), set()
        self._server = self._thread = self._identity = None

    @staticmethod
    def _validate_path(path):
        if (not isinstance(path, str) or not os.path.isabs(path)
                or '\x00' in path or len(os.fsencode(path)) > 107
                or os.path.normpath(path) != path or os.path.realpath(path) != path
                or os.path.lexists(path)):
            raise ValueError
        parent = os.stat(os.path.dirname(path))
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
                or stat.S_IMODE(parent.st_mode) != 0o700):
            raise ValueError

    def start(self):
        with self._lock:
            if self._stop.is_set() or self._server is not None:
                return
            server = None
            try:
                self._validate_path(self._path)
                server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                server.bind(self._path)
                info = os.lstat(self._path)
                self._identity = (info.st_dev, info.st_ino)
                os.chmod(self._path, 0o600)
                server.listen(4)
                server.settimeout(.1)
                self._server = server
                self._thread = threading.Thread(target=self._serve, daemon=True)
                self._thread.start()
            except BaseException:
                self._stop.set()
                if server is not None:
                    server.close()
                self._server = self._thread = None
                self._unlink()
                raise ValueError('Invalid relay configuration.') from None

    def _unlink(self):
        try:
            info = os.lstat(self._path)
            if stat.S_ISSOCK(info.st_mode) and (info.st_dev, info.st_ino) == self._identity:
                os.unlink(self._path)
        except FileNotFoundError:
            pass

    def _serve(self):
        while not self._stop.is_set():
            try:
                client, _ = self._server.accept()
            except OSError:
                continue
            with self._lock:
                if self._stop.is_set() or len(self._clients) >= 4:
                    client.close()
                    continue
                self._clients.add(client)
                worker = threading.Thread(target=self._handle, args=(client,), daemon=True)
                self._workers.add(worker)
                try:
                    worker.start()
                except Exception:
                    self._workers.discard(worker)
                    self._clients.discard(client)
                    client.close()

    def _connection(self, *args, **kwargs):
        if self._stop.is_set():
            raise TransportError(502)
        connection = _OwnedConnection(self, self._factory(*args, **kwargs))
        with self._lock:
            self._upstreams.add(connection)
        # Core owns cleanup once returned, even when stop raced with creation.
        return connection

    def _read(self, stream):
        remaining = 16384

        def line():
            nonlocal remaining
            data = stream.readline(remaining + 1)
            remaining -= len(data)
            if remaining < 0 or not data.endswith(b'\r\n'):
                raise TransportError(400)
            return data[:-2]
        first = line().split(b' ')
        if len(first) != 3 or first[2] not in (b'HTTP/1.0', b'HTTP/1.1'):
            raise TransportError(400)
        if first[0] != b'POST':
            raise TransportError(405)
        headers = {}
        while raw := line():
            name, separator, value = raw.partition(b':')
            if not separator or not re.fullmatch(rb"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name):
                raise TransportError(400)
            name = name.decode('ascii').lower()
            if name in headers or name == 'transfer-encoding':
                raise TransportError(400)
            headers[name] = value.strip(b' \t').decode('ascii')
        length = headers.get('content-length', '')
        if not re.fullmatch(r'[0-9]{1,20}', length) or int(length) > _REQUEST_LIMIT:
            raise TransportError(400)
        body = stream.read(int(length))
        if len(body) != int(length):
            raise TransportError(400)
        return first[1].decode('ascii'), headers, body

    def _handle(self, client):
        sent = False
        try:
            client.settimeout(30)
            with client.makefile('rb') as stream:
                target, headers, body = self._read(stream)
                if self._stop.is_set():
                    return
                with forward_request(self._profile, self._key, 'POST', target, headers, body,
                                     connection_factory=self._connection) as response:
                    client.settimeout(1800)
                    sent = True
                    content_type = response.headers.get('content-type')
                    head = f'HTTP/1.1 {response.status} OK\r\n'
                    if content_type is not None:
                        head += f'Content-Type: {content_type}\r\n'
                    client.sendall((head+'Connection: close\r\n\r\n').encode('ascii'))
                    for chunk in response:
                        client.sendall(chunk)
        except BaseException as error:
            if not sent and not self._stop.is_set():
                status = error.status if isinstance(error, TransportError) else 400
                try:
                    client.sendall((f'HTTP/1.1 {status} Error\r\nContent-Type: application/json\r\n'
                                    'Connection: close\r\n\r\n').encode('ascii') + _ERROR)
                except OSError:
                    pass
        finally:
            client.close()
            with self._lock:
                self._clients.discard(client)
                self._workers.discard(threading.current_thread())

    def close(self):
        deadline = time.monotonic() + 1.5
        with self._lock:
            self._stop.set()
            if self._server is not None:
                self._server.close()
            for client in self._clients:
                _abort(client)
            for upstream in self._upstreams:
                if upstream.captured is not None:
                    _abort(upstream.captured)
            threads = list(self._workers)
            if self._thread is not None:
                threads.append(self._thread)
            self._unlink()
        for thread in threads:
            thread.join(max(0, deadline-time.monotonic()))
