import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const fixture = String.raw`
import os, socket, stat, tempfile, threading, time
real_connect = socket.socket.connect
def local_only(sock, address):
    assert sock.family == socket.AF_UNIX, 'outbound forbidden'
    return real_connect(sock, address)
socket.socket.connect = local_only
socket.socket.connect_ex = local_only
real_bind = socket.socket.bind
def unix_bind(sock, address):
    assert sock.family == socket.AF_UNIX, 'TCP listener forbidden'
    return real_bind(sock, address)
socket.socket.bind = unix_bind
socket.create_connection = lambda *a, **k: (_ for _ in ()).throw(AssertionError('outbound forbidden'))
from harness.providers.relay import ProviderRelay
from harness.providers.profiles import get_profile
from harness.providers.transport import _REQUEST_LIMIT
KEY = 'synthetic-private-key'
p = get_profile('openai', 'selected')
body = b'{"model":"selected","tools":[{"signature":"opaque"}]}'
calls, connections = [], []
gate, entered = threading.Event(), threading.Event()
mode = ''
class Reply:
    status = 200
    def __init__(self): self.parts = [b'\x00data: signature ', b'synthetic-private-', b'key END']; self.closed = 0
    def getheaders(self): return [('Content-Type','text/event-stream'), ('Set-Cookie',KEY), ('Authorization',KEY)]
    def read1(self, size):
        if mode == 'streamblocked': entered.set(); self.sock.recv(1)
        if mode == 'streamfail' and not self.parts: raise OSError(KEY)
        return self.parts.pop(0) if self.parts else b''
    def close(self): self.closed += 1
class Connection:
    def __init__(self, host, timeout, context):
        assert host == 'api.openai.com' and timeout == 30
        self.sock = None; self.reply = Reply(); connections.append(self); self.closed = 0; self.connects = 0
    def connect(self):
        self.connects += 1
        if mode == 'late' or (mode == 'implicit' and self.connects == 2): entered.set(); gate.wait(3)
        self.sock, self.peer = socket.socketpair()
    def request(self, method, path, body, headers):
        assert self.sock.gettimeout() == 1800
        if mode == 'implicit': self.sock.close(); self.peer.close(); self.sock = None
        if self.sock is None: self.connect()
        calls.append((method,path,body,headers))
    def getresponse(self):
        self.reply.sock = self.sock
        if mode == 'blocked':
            entered.set(); self.sock.recv(1)
            raise OSError(KEY)
        if mode == 'vendorfail': raise OSError(KEY)
        return self.reply
    def close(self):
        self.closed += 1
        if self.sock: self.sock.close(); self.peer.close()
def client(path):
    s = socket.socket(socket.AF_UNIX); s.settimeout(2); s.connect(path); return s
def request(path, raw=None, fragmented=False):
    s = client(path)
    data = raw if raw is not None else b'POST /v1/responses HTTP/1.1\r\nHost: ignored\r\nAuthorization: client-key\r\nCookie: ignored\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body
    try:
        if fragmented:
            for part in [data[:25],data[25:-4],data[-4:]]: s.sendall(part)
        else: s.sendall(data)
        s.shutdown(socket.SHUT_WR)
        output = b''
        while chunk := s.recv(65536): output += chunk
        return output
    finally: s.close()
def error(status):
    return ('HTTP/1.1 %d Error\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n' % status).encode()+b'{"error":"Provider request failed."}'
def waitfor(check):
    end = time.monotonic()+1
    while not check() and time.monotonic()<end: time.sleep(.005)
    assert check()
with tempfile.TemporaryDirectory(prefix='pr-') as directory:
    path = directory+'/s'
`;
const cases = [
  ['native bytes and private headers', String.raw`
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
    try:
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
        assert KEY not in repr(relay)
        assert request(path,fragmented=True) == b'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n\x00data: signature [REDACTED] END'
        assert len(calls) == 1 and calls[0][:3] == ('POST','/v1/responses',body)
        assert calls[0][3] == {'Content-Type':'application/json','Content-Length':str(len(body)),'Authorization':'Bearer '+KEY}
    finally: relay.close(); relay.close()
    assert not os.path.lexists(path)
`],
  ['strict bounded framing and core validation', String.raw`
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
    try:
        for framing in [b'', b'Content-Length: 1\r\nContent-Length: 1\r\n', b'Content-Length: -1\r\n', b'Content-Length: +1\r\n', b'Content-Length: 0\r\nTransfer-Encoding: chunked\r\n', b'Content-Length: '+str(_REQUEST_LIMIT+1).encode()+b'\r\n', b'X: '+b'x'*17000+b'\r\n', b' Content-Length: 0\r\n']:
            assert request(path,b'POST /v1/responses HTTP/1.1\r\n'+framing+b'\r\n') == error(400)
        for first, status in [(b'CONNECT host:443 HTTP/1.1',405),(b'GET / HTTP/1.0',405),(b'POST https://evil.invalid/v1/responses HTTP/1.1',400),(b'POST /v1/responses HTTP/2.0',400)]:
            assert request(path, first+b'\r\nContent-Length: 0\r\n\r\n') == error(status)
        assert request(path,b'POST /v1/responses HTTP/1.1\r\nContent-Length: 1\r\n\r\nx') == error(400)
        assert not calls and not connections
    finally: relay.close()
`],
  ['canonical owned socket lifecycle', String.raw`
    for invalid in ['relative', directory+'/../x', directory+'//x', directory+'/'+'x'*108]:
        try: ProviderRelay(invalid,p,KEY,connection_factory=Connection).start(); assert False
        except ValueError as e: assert str(e) == 'Invalid relay configuration.'
    with open(path,'wb') as f: f.write(b'preserved')
    for candidate in [path, directory+'/link']:
        if candidate != path: os.symlink(path,candidate)
        try: ProviderRelay(candidate,p,KEY,connection_factory=Connection).start(); assert False
        except ValueError: pass
    assert open(path,'rb').read() == b'preserved'
    os.unlink(directory+'/link'); os.unlink(path)
    os.chmod(directory,0o755)
    try: ProviderRelay(path,p,KEY,connection_factory=Connection).start(); assert False
    except ValueError: pass
    os.chmod(directory,0o700)
    for key in ['', 'nonascii-\u0100', 'bad key']:
        try: ProviderRelay(path,p,key,connection_factory=Connection); assert False
        except ValueError as e: assert str(e) == 'Invalid relay configuration.'
    listen = socket.socket.listen
    def fail_listen(*args): raise OSError(KEY)
    socket.socket.listen = fail_listen
    try:
        try: ProviderRelay(path,p,KEY,connection_factory=Connection).start(); assert False
        except ValueError as e: assert str(e) == 'Invalid relay configuration.'
        assert not os.path.lexists(path)
    finally: socket.socket.listen = listen
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.close(); relay.start(); relay.close()
    assert not os.path.lexists(path)
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
    os.unlink(path)
    with open(path,'wb') as f: f.write(b'replacement')
    relay.close(); assert open(path,'rb').read() == b'replacement'
    assert not calls
`],
  ['four-client cap and bounded concurrent shutdown', String.raw`
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
    clients = [client(path) for _ in range(4)]
    time.sleep(.08)
    overflow = client(path); assert overflow.recv(1) == b''; overflow.close()
    started = time.monotonic()
    closers = [threading.Thread(target=relay.close) for _ in range(2)]
    for t in closers: t.start()
    for t in closers: t.join(2); assert not t.is_alive()
    assert time.monotonic()-started < 2 and not calls
    for s in clients: assert s.recv(1) == b''; s.close()
    assert not os.path.lexists(path)
`],
  ['stop aborts inflight sockets and late connect', String.raw`
    for mode in ['blocked','late','implicit','streamblocked']:
        gate.clear(); entered.clear(); calls.clear()
        relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
        result = []
        def send():
            try: result.append(request(path))
            except OSError: pass
        worker = threading.Thread(target=send); worker.start(); assert entered.wait(1)
        started = time.monotonic(); relay.close(); assert time.monotonic()-started < 2
        gate.set(); worker.join(1); assert not worker.is_alive()
        waitfor(lambda: connections[-1].closed == 1)
        assert len(calls) == (1 if mode in ['blocked','streamblocked'] else 0)
        assert not os.path.lexists(path)
`],
  ['generic failures and no fabricated stream completion', String.raw`
    relay = ProviderRelay(path,p,KEY,connection_factory=Connection); relay.start()
    try:
        mode = 'vendorfail'; assert request(path) == error(502)
        mode = 'streamfail'; output = request(path)
        assert output == b'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n\x00data: signature [REDACTED]'
        assert KEY.encode() not in output
    finally: relay.close()
`],
];
let failures = 0;
for (const [name, source] of cases) {
  const result = spawnSync('python3', ['-B', '-c', fixture + source + "\nprint('ok')\n"], {
    cwd: resolve(import.meta.dirname, '../..'), env: { PATH: process.env.PATH, PYTHONPATH: resolve(import.meta.dirname, '../..') },
    encoding: 'utf8', timeout: 4500,
  });
  try {
    assert.ifError(result.error);
    assert.deepEqual({exit:result.status,out:result.stdout,err:result.stderr},{exit:0,out:'ok\n',err:''});
    console.log(`ok - ${name}`);
  } catch (e) { failures++; console.error(`not ok - ${name}: ${e.message}`); }
}
if (failures) process.exitCode = 1;
