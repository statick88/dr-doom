import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { PassThrough } from "node:stream";
import { resolve } from "node:path";
import { applyLocalPolicy, createModelProxy } from "../../harness/disposable/model-proxy.mjs";

const root = resolve(import.meta.dirname, "../..");
const prelude = `
import contextlib, importlib.util, io, json, os, pathlib, tempfile, time
spec=importlib.util.spec_from_file_location('runtime', ${JSON.stringify(resolve(root, "harness/disposable/runtime.py"))})
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
class Result:
 def __init__(self, code=0, stdout=b'', stderr=b''):
  self.returncode,self.stdout,self.stderr=code,stdout,stderr
`;
function python(body) {
  const result = spawnSync("python3", ["-B", "-c", prelude + body], {
    cwd: root, encoding: "utf8", timeout: 5000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ok\n");
  assert.equal(result.stderr, "");
}

test("local proxy has a one-hour policy while unmarked/API defaults stay unchanged", () => {
  const local = createModelProxy("unused", { localPolicy: true });
  const existing = createModelProxy("unused");
  assert.equal(local.server.requestTimeout, 3_600_000);
  assert.equal(local.server.headersTimeout, 3_620_000);
  assert.equal(existing.server.requestTimeout, 1_800_000);
  assert.equal(existing.server.headersTimeout, 1_820_000);
  const settings = JSON.parse(readFileSync(resolve(root, "harness/disposable/config/settings.json")));
  assert.equal(settings.httpIdleTimeoutMs, 1_800_000);
  assert.deepEqual(settings.retry, { enabled: false, maxRetries: 0 });
  const localSettings = applyLocalPolicy(settings);
  assert.equal(localSettings.httpIdleTimeoutMs, 3_600_000);
  assert.deepEqual(localSettings.retry, settings.retry);
  assert.equal(settings.httpIdleTimeoutMs, 1_800_000);
  assert.deepEqual({ ...localSettings, httpIdleTimeoutMs: settings.httpIdleTimeoutMs }, settings);
});

test("the real proxy request wires the local upstream timeout and retains the default", { timeout: 2000 }, async () => {
  for (const localPolicy of [false, true]) {
    const original = http.request;
    let client;
    let observed;
    const timeoutSeen = new Promise((done) => { observed = done; });
    http.request = () => {
      const upstream = new PassThrough();
      upstream.setTimeout = (ms) => { observed(ms); return upstream; };
      return upstream;
    };
    const proxy = createModelProxy("synthetic-only", { port: 0, localPolicy });
    try {
      proxy.listen();
      await new Promise((done) => proxy.server.once("listening", done));
      client = original({ host: "127.0.0.1", port: proxy.server.address().port, path: "/synthetic" });
      client.on("error", () => {});
      client.end();
      assert.equal(await timeoutSeen, localPolicy ? 3_600_000 : 1_800_000);
    } finally {
      http.request = original;
      client?.destroy();
      await new Promise((done) => proxy.server.close(done));
    }
  }
});

test("local relay allows a full one-hour prefill without changing provider transport", () => {
  python(`
assert r.RELAY_INACTIVITY_TIMEOUT == 3600
from harness.providers import relay, transport
assert '.settimeout(1800)' in pathlib.Path(relay.__file__).read_text()
assert '.settimeout(1800)' in pathlib.Path(transport.__file__).read_text()
print('ok')
`);
});

test("malformed immutable image selection is rejected before Docker or workspace creation", () => {
  python(`
r.DOCKER='/bin/true'
for value in ['', 'dr-doom-gentle:other', 'sha256:'+'A'*64, 'sha256:'+'a'*63]:
 with tempfile.TemporaryDirectory() as scratch:
  calls=[]; r.subprocess.run=lambda *a,**kw: calls.append(a) or Result()
  os.environ['DOOM_LOCAL_IMAGE_ID']=value
  err=io.StringIO()
  with contextlib.redirect_stderr(err):
   try: r.main(['--root',scratch,'--','--print','synthetic'])
   except SystemExit as exc: assert exc.code==2
   else: raise AssertionError('invalid selector accepted')
  assert err.getvalue()=='doom: DOOM_LOCAL_IMAGE_ID requiere sha256: y 64 caracteres hexadecimales minúsculos\\n'
  assert calls==[] and list(pathlib.Path(scratch).iterdir())==[]
print('ok')
`);
});

test("local launches select only the immutable ID and mark the fixed policy for every flow", () => {
  python(`
r.DOCKER='/bin/true'
for flow in [None,'ctf','pentest','redteam']:
 for image in [None,'sha256:'+'a'*64]:
  with tempfile.TemporaryDirectory() as scratch:
   calls=[]
   def run(argv,**kwargs): calls.append(argv); return Result()
   r.subprocess.run=run
   if image is None: os.environ.pop('DOOM_LOCAL_IMAGE_ID',None)
   else: os.environ['DOOM_LOCAL_IMAGE_ID']=image
   args=['--root',scratch]+(['--flow',flow] if flow else [])+['--','--print','synthetic']
   assert r.main(args)==0
   assert calls[0]==[r.DOCKER,'image','inspect',image or r.IMAGE]
   command=next(c for c in calls if c[:2]==[r.DOCKER,'run'])
   assert (image or r.IMAGE) in command
   assert 'DOOM_LOCAL_CPU_POLICY=1' in command
   assert '--pull=never' in command and '--network=none' in command
   assert '--read-only' in command and '--cap-drop=ALL' in command
   assert '--security-opt=no-new-privileges' in command
   if flow: assert command[command.index(image or r.IMAGE)+1:command.index(image or r.IMAGE)+3]==['--flow',flow]
print('ok')
`);
});

test("cleanup confirms delayed exact-name disappearance instead of trusting rm or stderr", () => {
  python(`
clock=[0.0]; calls=[]; remaining=[2]
r.cleanup_clock=lambda:clock[0]
time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
def run(argv,**kwargs):
 calls.append((argv,kwargs['timeout']))
 if argv[1]=='rm': return Result(1,stderr=b'removal already in progress')
 assert argv[:4]==[r.DOCKER,'container','ls','-a']
 assert any(value.replace(chr(92),'')=='name=^/doom-owned$' for value in argv)
 remaining[0]-=1
 return Result(stdout=b'doom-owned\\n' if remaining[0]>=0 else b'')
r.subprocess.run=run
err=io.StringIO()
with contextlib.redirect_stderr(err): r.cleanup('doom-owned',{})
assert err.getvalue()=='' and remaining[0]<0 and len(calls)==4
assert clock[0]<20 and all(0<t<=10 for _,t in calls)
assert all('unrelated' not in ' '.join(c) for c,_ in calls)
print('ok')
`);
});

test("cleanup OS errors fail closed without exposing exception messages", () => {
  python(`
def denied(*args,**kwargs): raise PermissionError('synthetic-detail-not-for-output')
r.subprocess.run=denied
err=io.StringIO()
with contextlib.redirect_stderr(err): result=r.cleanup('doom-owned',{})
assert result is False
assert 'PermissionError' in err.getvalue() and 'posible contenedor huérfano' in err.getvalue()
assert 'synthetic-detail-not-for-output' not in err.getvalue()
print('ok')
`);
});

test("ambiguous cleanup stays failed and retains bounded phase diagnostics", () => {
  python(`
clock=[0.0]; calls=[]
r.cleanup_clock=lambda:clock[0]
time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
def run(argv,**kwargs):
 calls.append(kwargs['timeout']); clock[0]+=kwargs['timeout']
 return Result(1,stderr=b'daemon unavailable')
r.subprocess.run=run
err=io.StringIO()
with contextlib.redirect_stderr(err): r.cleanup('doom-owned',{})
text=err.getvalue()
assert 'posible contenedor huérfano: doom-owned' in text
assert 'daemon unavailable' in text and 'rm' in text and 'list' in text
assert clock[0]<=20 and sum(calls)<=20
print('ok')
`);
});
