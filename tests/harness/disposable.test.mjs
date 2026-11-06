import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "d-"));
const run = (file, args, env = {}) => new Promise((done, fail) => {
  const child = spawn(file, args, { cwd: root, env: { ...process.env, ...env } });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail);
  child.on("close", (code) => done({ code, stdout, stderr }));
});

try {
  const help = await run(join(root, "doom"), ["--help"]);
  assert.deepEqual(help, { code: 0, stderr: "", stdout: help.stdout });
  assert.match(help.stdout, /Uso: doom \[ctf\|pentest\|redteam\] \[argumentos de Pi\]/);
  assert.match(help.stdout, /Construye la imagen una vez/);

  const invalid = await run(join(root, "doom"), ["invalid-flow"]);
  assert.equal(invalid.code, 2);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /flujo no válido: invalid-flow/);

  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1])
runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
print(json.dumps(runtime.build_docker_argv('/work', '/bridge/model.sock', ['--print', 'hola'], 1000, 1000)))
`;
  const argv = await run("python3", ["-c", code, join(root, "harness/disposable/runtime.py")]);
  assert.equal(argv.code, 0, argv.stderr);
  const docker = JSON.parse(argv.stdout);
  assert.deepEqual(docker.slice(0, 5), ["/usr/bin/docker", "run", "--pull=never", "--rm", "--name"]);
  assert.ok(docker.includes("--interactive"));
  assert.ok(!docker.includes("--tty"));
  const tty = JSON.parse((await run("python3", ["-c", code.replace("1000, 1000)", "1000, 1000, tty=True)"), join(root, "harness/disposable/runtime.py")])).stdout);
  assert.ok(tty.includes("--tty"));
  for (const expected of ["--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=2g", "--cpus=2", "--user=1000:1000"])
    assert.ok(docker.includes(expected), `missing ${expected}`);
  assert.ok(docker.includes("type=bind,src=/work,dst=/workspace"));
  assert.ok(docker.includes("type=bind,src=/bridge,dst=/bridge,readonly"));
  assert.ok(!docker.some((value) => value.includes("docker.sock")));
  assert.ok(!docker.includes("--privileged"));

  const mocked = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1]); runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
calls = []
class Result:
 def __init__(self, code=0): self.returncode=code; self.stderr=b''; self.stdout=b''
def fake(argv, **kwargs): calls.append((argv, kwargs)); return Result()
runtime.DOCKER = '/bin/true'; runtime.subprocess.run = fake
code = runtime.main(['--root', sys.argv[2], '--', '--print', 'hola'])
assert code == 0
assert calls[0][0] == ['/bin/true', 'image', 'inspect', runtime.IMAGE]
assert '--network=none' in calls[1][0] and '--interactive' in calls[1][0]
assert any(call[0][:3] == ['/bin/true', 'rm', '-f'] for call in calls)
assert calls[-1][0][:4] == ['/bin/true', 'container', 'ls', '-a']
print('mocked-launch-ok')
`;
  const launched = await run("python3", ["-c", mocked, join(root, "harness/disposable/runtime.py"), scratch]);
  assert.equal(launched.code, 0, launched.stderr); assert.equal(launched.stdout, "mocked-launch-ok\n");

  const cleanupContract = `
import contextlib, importlib.util, io, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1]); runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
class Result:
 def __init__(self, code, stderr=b''): self.returncode, self.stderr, self.stdout = code, stderr, b''
calls = []
def absent(argv, **kwargs):
 calls.append(argv)
 return Result(1, b'localized removal race') if argv[1]=='rm' else Result(0)
runtime.subprocess.run = absent
out = io.StringIO()
with contextlib.redirect_stderr(out): runtime.cleanup('doom-own', {})
assert out.getvalue() == ''
assert calls == [[runtime.DOCKER, 'rm', '-f', 'doom-own'], [runtime.DOCKER, 'container', 'ls', '-a', '--filter', 'name=^/doom\\\\-own$', '--format', '{{.Names}}']]
print('cleanup-contract-ok')
`;
  const cleanup = await run("python3", ["-c", cleanupContract, join(root, "harness/disposable/runtime.py")]);
  assert.equal(cleanup.code, 0, cleanup.stderr); assert.equal(cleanup.stdout, "cleanup-contract-ok\n");

  const signalContract = `
import importlib.util, signal, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1]); runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
calls = []
class Result:
 def __init__(self, code=0, stderr=b'no such container'): self.returncode, self.stderr, self.stdout = code, stderr, b''
def fake(argv, **kwargs):
 calls.append(argv)
 if argv[:2] == [runtime.DOCKER, 'run']: signal.raise_signal(signal.SIGTERM)
 return Result(1 if argv[:3] == [runtime.DOCKER, 'rm', '-f'] else 0)
runtime.DOCKER = '/bin/true'; runtime.subprocess.run = fake
try: runtime.main(['--root', sys.argv[2], '--', '--print', 'hola'])
except SystemExit as stopped: assert stopped.code == 143
else: raise AssertionError('SIGTERM did not exit 143')
assert any(call[:3] == [runtime.DOCKER, 'rm', '-f'] for call in calls)
assert all('unrelated' not in call for call in calls)
print('signal-contract-ok')
`;
  const signalled = await run("python3", ["-c", signalContract, join(root, "harness/disposable/runtime.py"), scratch]);
  assert.equal(signalled.code, 0, signalled.stderr); assert.equal(signalled.stdout, "signal-contract-ok\n");

  await symlink("/", join(scratch, "escape"));
  const escaped = await run("python3", [join(root, "harness/disposable/runtime.py"), "--workspace", join(scratch, "escape")]);
  assert.equal(escaped.code, 2);
  assert.equal(escaped.stdout, "");
  assert.match(escaped.stderr, /espacio de trabajo inválido/);
  const pullAndTimeoutContract = `
import contextlib, importlib.util, io, subprocess, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1]); runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
argv = runtime.build_docker_argv('/work', '/bridge/model.sock', [], 1000, 1000)
assert '--pull=never' in argv
class Result:
 def __init__(self, code=1, stderr=b''): self.returncode, self.stderr = code, stderr
calls = []
def timed_out(argv, **kwargs):
 calls.append((argv, kwargs))
 raise subprocess.TimeoutExpired(argv, kwargs['timeout'])
runtime.subprocess.run = timed_out
out = io.StringIO()
with contextlib.redirect_stderr(out): runtime.cleanup('doom-own', {})
assert out.getvalue().startswith('doom: posible contenedor huérfano: doom-own\\n')
assert '"phase": "rm"' in out.getvalue() and '"phase": "list"' in out.getvalue()
assert '"timeout": true' in out.getvalue()
assert len(calls)==2 and calls[0][0]==[runtime.DOCKER, 'rm', '-f', 'doom-own']
assert all(0 < kwargs['timeout'] <= runtime.DOCKER_TIMEOUT for _,kwargs in calls)
assert calls[1][0][:4]==[runtime.DOCKER, 'container', 'ls', '-a']
runtime.DOCKER = '/bin/true'
out = io.StringIO()
with contextlib.redirect_stderr(out):
 try: runtime.main(['--root', sys.argv[2]])
 except SystemExit as stopped: assert stopped.code == 2
 else: raise AssertionError('inspect timeout did not fail')
assert out.getvalue() == f'doom: no se pudo verificar la imagen local: {runtime.IMAGE}\\n'
assert calls[-1][0] == [runtime.DOCKER, 'image', 'inspect', runtime.IMAGE]
assert calls[-1][1]['timeout'] == runtime.DOCKER_TIMEOUT
print('pull-and-timeout-contract-ok')
`;
  const pullAndTimeout = await run("python3", ["-c", pullAndTimeoutContract, join(root, "harness/disposable/runtime.py"), scratch]);
  assert.equal(pullAndTimeout.code, 0, pullAndTimeout.stderr); assert.equal(pullAndTimeout.stdout, "pull-and-timeout-contract-ok\n");

  console.log("ok - launcher contract and disposable Docker boundary");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
