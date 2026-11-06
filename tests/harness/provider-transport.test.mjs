import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-transport-"));
const fixture = `import socket, os
socket.create_connection = lambda *a, **k: (_ for _ in ()).throw(AssertionError('real network'))
from harness.providers.profiles import get_profile
from harness.providers.transport import forward_request, TransportError
# TLS may consult certificate-trust configuration, never provider credentials.
KEY = 'synthetic-host-secret'
class Reply:
    status = 200
    def __init__(self):
        self.parts = [b'data: native tool signature thinking\\n', b'synthetic-host-', b'secret END']
        self.closed = 0
    def getheaders(self):
        return [('Content-Type', 'text/event-stream'), ('Set-Cookie', KEY), ('X-Debug', KEY), ('Authorization', KEY)]
    def read1(self, size):
        assert 0 < size <= 65536
        part = self.parts.pop(0) if self.parts else b''
        if isinstance(part, BaseException):
            raise part
        return part
    def close(self): self.closed += 1
class Connection:
    def __init__(self, host, timeout, context=None):
        calls.append((host, timeout))
        self.closed = 0
        self.sock = self
        self.reply = Reply()
        connections.append(self)
    def connect(self): pass
    def settimeout(self, value): assert value == 1800
    def request(self, method, path, body, headers):
        self.sent = (method, path, body, headers)
    def getresponse(self): return self.reply
    def close(self): self.closed += 1
calls, connections = [], []
p = get_profile('openai', 'selected')
body = b'{"model":"selected","tools":[{"opaque":"signature"}],"thinking":"unchanged"}'
headers = {'Authorization':'client-secret', 'x-api-key':'client-secret', 'Cookie':'client-secret',
           'Host':'evil.invalid', 'Forwarded':'evil.invalid', 'Connection':'keep-alive',
           'Content-Length':'999', 'Content-Type':'application/json', 'Accept':'text/event-stream'}
def send(profile=p, method='POST', target='/v1/responses', incoming=headers, payload=body, key=KEY, factory=Connection):
    return forward_request(profile, key, method, target, incoming, payload, connection_factory=factory)
def reject(status, **kwargs):
    before = (list(calls), list(connections), dict(headers), body, repr(p))
    try:
        send(**kwargs)
        raise AssertionError('accepted')
    except TransportError as error:
        assert error.status == status
        assert str(error) == 'Provider request failed.'
        assert KEY not in repr(error)
    assert before == (calls, connections, headers, body, repr(p))
`;
let failures = 0;
const check = (name, source) => {
  const result = spawnSync("python3", ["-B", "-c", `${fixture}\n${source}\nprint('ok')`], {
    cwd: scratch, env: { PATH: process.env.PATH, PYTHONPATH: root, HOME: scratch }, encoding: "utf8", timeout: 10000,
  });
  try {
    assert.ifError(result.error);
    assert.deepEqual({ code: result.status, stdout: result.stdout, stderr: result.stderr },
      { code: 0, stdout: "ok\n", stderr: "" });
    console.log(`ok - ${name}`);
  } catch (error) { failures++; console.error(`not ok - ${name}: ${error.message}`); }
};
try {
  check("four native routes, frozen region and credential stripping", `
for provider, region, route, host, upstream, auth in [
 ('openai', None, '/v1/responses', 'api.openai.com', '/v1/responses', 'Authorization'),
 ('anthropic', None, '/v1/messages', 'api.anthropic.com', '/v1/messages', 'x-api-key'),
 ('qwen', 'intl', '/v1/chat/completions', 'dashscope-intl.aliyuncs.com', '/compatible-mode/v1/chat/completions', 'Authorization'),
 ('gemini', None, '/v1beta/models/selected:streamGenerateContent?key=client-secret&alt=sse', 'generativelanguage.googleapis.com', '/v1beta/models/selected:streamGenerateContent?alt=sse', 'x-goog-api-key')]:
    profile = get_profile(provider, 'selected', region=region)
    native = body if provider != 'gemini' else b'{"contents":[],"signature":"opaque"}'
    with send(profile=profile, target=route, payload=native) as response:
        assert response.status == 200
        assert response.headers == {'content-type':'text/event-stream'}
        assert b''.join(response) == b'data: native tool signature thinking\\n[REDACTED] END'
    c = connections[-1]
    assert calls[-1] == (host, 30)
    expected = {'Content-Type':'application/json', 'Accept':'text/event-stream', 'Content-Length':str(len(native)), auth: ('Bearer ' if auth == 'Authorization' else '') + KEY}
    if provider == 'anthropic': expected['anthropic-version'] = '2023-06-01'
    assert c.sent == ('POST', upstream, native, expected)
    assert c.closed == c.reply.closed == 1
`);
  check("routing, JSON model and key validation reject before attempt", `
for target in ['https://evil.invalid/v1/responses', '//evil.invalid/v1/responses', '/v1/responses?key=x', '/v1/messages', '/v1/responses#x']:
    reject(400, target=target)
for method in ['CONNECT', 'GET']: reject(405, method=method)
for payload in [b'{', b'[]', b'{"model":"wrong"}', b'{"model":"selected","model":"selected"}', b'{"model":"selected","x":NaN}', b'x' * (8*1024*1024+1)]:
    reject(400, payload=payload)
for key in ['', 'x\\r\\nsecret', 'nonascii-\\u0100', 'sk-ant-oat-test']:
    reject(400, key=key)
google = get_profile('gemini', 'selected')
for target in ['/v1beta/models/wrong:streamGenerateContent?alt=sse', '/v1beta/models/selected:streamGenerateContent?alt=sse&url=evil', '/v1beta/models/selected:streamGenerateContent?alt=sse&alt=sse']:
    reject(400, profile=google, target=target)
`);
  check("header validation and native feature preservation", `
for value in ['application/json\\r\\nAuthorization: evil', 'x'*8193, '\\u0100']:
    reject(400, incoming={'Content-Type':value})
reject(400, incoming={'Accept':'a', 'accept':'b'})
with send(profile=get_profile('anthropic','selected'), target='/v1/messages', incoming={'anthropic-version':'2023-06-01', 'anthropic-beta':'native-feature'}) as response:
    assert connections[-1].sent[3]['anthropic-beta'] == 'native-feature'
    assert b''.join(response).endswith(b'[REDACTED] END')
`);
  check("safe errors, redirects and exact owned cleanup", `
for status in [302, 401, 429, 500]:
    def factory(host, timeout, **kwargs):
        c = Connection(host, timeout, **kwargs)
        c.reply.status = status
        return c
    try: send(factory=factory)
    except TransportError as error:
        assert error.status == (502 if status == 302 else status)
        assert str(error) == 'Provider request failed.'
    else: raise AssertionError('accepted status')
    c = connections[-1]
    assert c.closed == c.reply.closed == 1
    assert len(c.reply.parts) == 3
r = send()
c = connections[-1]
r.close(); r.close()
assert list(r) == [] and c.closed == c.reply.closed == 1
r = send()
c = connections[-1]
c.reply.parts = [RuntimeError(KEY)]
try: list(r)
except TransportError as error:
    assert error.status == 502 and KEY not in str(error)
else: raise AssertionError('read error ignored')
assert c.closed == c.reply.closed == 1
def secret_header(host, timeout, **kwargs):
    c = Connection(host, timeout, **kwargs)
    c.reply.getheaders = lambda: [('Content-Type', KEY)]
    return c
with send(factory=secret_header) as r:
    assert r.headers == {'content-type':'[REDACTED]'}
def fail_request(host, timeout, **kwargs):
    c = Connection(host, timeout, **kwargs)
    def fail(*args, **kwargs): raise OSError(KEY)
    c.request = fail
    return c
try: send(factory=fail_request)
except TransportError as error: assert error.status == 502
else: raise AssertionError('request failure ignored')
assert connections[-1].closed == 1 and connections[-1].reply.closed == 0
`);
  check("bounded response and connection failure sanitization", `
def broken(*args, **kwargs): raise OSError(KEY)
try: send(factory=broken)
except TransportError as error:
    assert error.status == 502 and str(error) == 'Provider request failed.'
else: raise AssertionError('connection failure ignored')
r = send()
c = connections[-1]
c.reply.parts = [b'x'*65536]*513
try:
    for chunk in r: assert len(chunk) <= 65536
except TransportError as error: assert error.status == 502
else: raise AssertionError('response limit ignored')
assert c.closed == c.reply.closed == 1
`);
  check("cancellation propagates with deterministic owned cleanup", `
for cancel in (KeyboardInterrupt, SystemExit, GeneratorExit):
    for stage in ('connect', 'request', 'getresponse', 'read1'):
        signal = cancel()
        def interrupt(*args, **kwargs): raise signal
        def factory(host, timeout, **kwargs):
            c = Connection(host, timeout, **kwargs)
            setattr(c.reply if stage == 'read1' else c, stage, interrupt)
            return c
        before = (dict(headers), body, repr(p))
        try:
            with send(factory=factory) as response: list(response)
        except cancel as error: assert error is signal
        else: raise AssertionError('cancellation masked')
        c = connections[-1]
        assert c.closed == 1 and c.reply.closed == (stage == 'read1')
        assert before == (headers, body, repr(p))
    response = send()
    c = connections[-1]
    def close_reply():
        c.reply.closed += 1
        raise cancel()
    c.reply.close = close_reply
    try: response.close()
    except cancel: pass
    else: raise AssertionError('close cancellation masked')
    response.close()
    assert c.closed == c.reply.closed == 1
    response = send()
    c = connections[-1]
    c.reply.close = close_reply
    original = cancel()
    try:
        with response: raise original
    except cancel as error: assert error is original
    else: raise AssertionError('active cancellation masked')
    response.close()
    assert c.closed == c.reply.closed == 1
`);
  check("explicit verified TLS context ignores ambient key logging", `
import ssl
from http.client import HTTPSConnection
from pathlib import Path
from tempfile import TemporaryDirectory
with TemporaryDirectory() as directory:
    keylog = Path(directory) / 'synthetic-keylog'
    os.environ['SSLKEYLOGFILE'] = str(keylog)
    before = dict(os.environ)
    class RealConstructor(HTTPSConnection):
        connect = Connection.connect
        settimeout = Connection.settimeout
        request = Connection.request
        getresponse = Connection.getresponse
        close = Connection.close
        def __init__(self, host, **kwargs):
            super().__init__(host, **kwargs)
            self.sock, self.closed, self.reply = self, 0, Reply()
            connections.append(self)
    with send(factory=RealConstructor) as response:
        context = connections[-1]._context
        assert not keylog.exists(), 'ambient TLS keylog created'
        assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
        assert context.keylog_filename is None
        assert b''.join(response).endswith(b'[REDACTED] END')
    assert connections[-1].closed == connections[-1].reply.closed == 1
    assert dict(os.environ) == before
`);
  assert.deepEqual(await readdir(scratch), []);
  if (failures) process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
