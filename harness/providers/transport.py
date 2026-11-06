"""Host-only native HTTP forwarding; no provider credential lookup or activation."""

from http.client import HTTPSConnection
import json
import re
import ssl
import sys
from urllib.parse import parse_qsl, urlsplit

from .profiles import APIProfile, resolve_api_key

_REQUEST_LIMIT = 8 * 1024 * 1024
_RESPONSE_LIMIT = 32 * 1024 * 1024
_CHUNK = 65536
_SAFE_HEADERS = {
    "content-type": "Content-Type", "accept": "Accept",
    "anthropic-version": "anthropic-version", "anthropic-beta": "anthropic-beta",
}


class TransportError(Exception):
    """Safe HTTP status for a future wrapper; never carries vendor text."""

    def __init__(self, status):
        super().__init__("Provider request failed.")
        self.status = status


def _header(value):
    if (not isinstance(value, str) or len(value) > 8192
            or not re.fullmatch(r"[\x20-\x7e]*", value)):
        raise TransportError(400)
    return value


def _object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise TransportError(400)
        result[name] = value
    return result


def _invalid_constant(value):
    raise TransportError(400)


def _prepare(profile, host_key, method, target, headers, body):
    if type(profile) is not APIProfile:
        raise TransportError(400)
    key = resolve_api_key(profile, {profile.key_env: host_key})
    if len(key) > 8192 or not key.isascii():
        raise TransportError(400)
    if method != "POST":
        raise TransportError(405)
    if (not isinstance(target, str) or len(target) > 4096
            or not isinstance(body, bytes) or len(body) > _REQUEST_LIMIT):
        raise TransportError(400)
    provider = profile.provider
    paths = {"openai": "/v1/responses", "anthropic": "/v1/messages", "qwen": "/v1/chat/completions"}
    if provider == "gemini":
        path = f"/v1beta/models/{profile.model}:streamGenerateContent"
        if not target.startswith(path + "?") or "#" in target:
            raise TransportError(400)
        query = parse_qsl(target[len(path)+1:], keep_blank_values=True, strict_parsing=True, max_num_fields=2)
        params = _object(query)
        if params.get("alt") != "sse" or set(params) - {"alt", "key"}:
            raise TransportError(400)
        upstream_path = path + "?alt=sse"
    else:
        if target != paths[provider]:
            raise TransportError(400)
        upstream_path = ("/compatible-mode" if provider == "qwen" else "") + target
    payload = json.loads(body.decode("utf-8"), object_pairs_hook=_object, parse_constant=_invalid_constant)
    if not isinstance(payload, dict) or (provider != "gemini" and payload.get("model") != profile.model):
        raise TransportError(400)
    outgoing = {}
    for name, value in headers.items():
        if not isinstance(name, str):
            raise TransportError(400)
        lower = name.lower()
        if lower not in _SAFE_HEADERS or (lower.startswith("anthropic-") and provider != "anthropic"):
            continue
        canonical = _SAFE_HEADERS[lower]
        if canonical in outgoing:
            raise TransportError(400)
        outgoing[canonical] = _header(value)
    outgoing.setdefault("Content-Type", "application/json")
    outgoing["Content-Length"] = str(len(body))
    if provider in ("openai", "qwen"):
        outgoing["Authorization"] = "Bearer " + key
    elif provider == "anthropic":
        outgoing["x-api-key"] = key
        outgoing.setdefault("anthropic-version", "2023-06-01")
    else:
        outgoing["x-goog-api-key"] = key
    return urlsplit(profile.upstream).hostname, upstream_path, outgoing, key.encode("ascii")


def _close(response, connection):
    # Attempt both closes; preserve an active cancellation over cleanup failures.
    active, cancelled = sys.exception(), None
    for owned in (response, connection):
        if owned is not None:
            try:
                owned.close()
            except Exception:
                pass
            except BaseException as error:
                if cancelled is None:
                    cancelled = error
    if cancelled is not None and (active is None or isinstance(active, Exception)):
        raise cancelled


def _tls_context():
    # Unlike create_default_context, this never enables ambient SSLKEYLOGFILE.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.load_default_certs()
    context.set_alpn_protocols(["http/1.1"])
    return context


class ForwardResponse:
    """Single-use host-side byte iterator. Use with/close even on early exit."""

    def __init__(self, response, connection, key):
        self.status = response.status
        self.headers = {}
        for name, value in response.getheaders():
            if name.lower() == "content-type":
                marker = "" if key in b"[REDACTED]" else "[REDACTED]"
                self.headers["content-type"] = _header(value).replace(key.decode("ascii"), marker)
        self._response, self._connection, self._key = response, connection, key
        self._closed = False
        self._iterator = self._stream()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        if self._closed:
            raise StopIteration
        return next(self._iterator)

    def close(self):
        if not self._closed:
            self._closed = True
            _close(self._response, self._connection)

    def _stream(self):
        pending = b""
        total = 0
        marker = b"" if self._key in b"[REDACTED]" else b"[REDACTED]"
        try:
            while not self._closed:
                chunk = self._response.read1(_CHUNK)
                if not chunk:
                    if pending:
                        yield pending.replace(self._key, marker)
                    break
                total += len(chunk)
                if len(chunk) > _CHUNK or total > _RESPONSE_LIMIT:
                    raise TransportError(502)
                pending += chunk
                # Keep enough suffix to catch a secret spanning any read boundary.
                while len(pending) >= len(self._key):
                    cut = len(pending) - len(self._key) + 1
                    index = pending.find(self._key)
                    if index >= 0:
                        redacted = pending[:index] + marker
                        for offset in range(0, len(redacted), _CHUNK):
                            yield redacted[offset:offset + _CHUNK]
                        pending = pending[index + len(self._key):]
                    else:
                        yield pending[:cut]
                        pending = pending[cut:]
        except Exception:
            raise TransportError(502) from None
        finally:
            self.close()


def forward_request(profile: APIProfile, host_key: str, method: str, target: str,
                    headers, body: bytes, *, connection_factory=HTTPSConnection):
    """Validate before one fixed-origin attempt; return an owned native response.

    Factory contract: HTTPSConnection(host, timeout=30, context=secure_context), connect/sock.settimeout,
    request, getresponse, close. Injection is for trusted host-side tests only.
    """
    response = connection = None
    try:
        host, path, outgoing, key = _prepare(profile, host_key, method, target, headers, body)
    except TransportError:
        raise
    except Exception:
        raise TransportError(400) from None
    status = 502
    try:
        connection = connection_factory(host, timeout=30, context=_tls_context())
        connection.connect()
        connection.sock.settimeout(1800)
        connection.request("POST", path, body=body, headers=outgoing)
        response = connection.getresponse()
        if not 200 <= response.status < 300:
            status = response.status if 400 <= response.status <= 599 else 502
            raise TransportError(status)
        return ForwardResponse(response, connection, key)
    except BaseException as error:
        _close(response, connection)
        if not isinstance(error, Exception):
            raise
        raise TransportError(status) from None
