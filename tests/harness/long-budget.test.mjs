import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const settings = JSON.parse(await readFile(resolve(root, "harness/disposable/config/settings.json"), "utf8"));
assert.deepEqual(settings.retry, { enabled: false, maxRetries: 0 });
assert.equal(settings.httpIdleTimeoutMs, 1_800_000);

const relayContract = `
import importlib.util, json, socket, sys
spec = importlib.util.spec_from_file_location('runtime', sys.argv[1])
runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
seen = []
class Peer:
 def settimeout(self, value): seen.append(value)
 def recv(self, _): return b''
 def close(self): pass
 def shutdown(self, _): pass
class Client(Peer):
 def recv(self, _): return b''
runtime.socket.create_connection = lambda *_args, **_kwargs: Peer()
relay = object.__new__(runtime.Relay)
relay.clients = set([Client()]); relay.lock = __import__('threading').Lock()
relay.pipe(next(iter(relay.clients)))
assert runtime.RELAY_INACTIVITY_TIMEOUT == 3600
assert seen == [runtime.RELAY_INACTIVITY_TIMEOUT, runtime.RELAY_INACTIVITY_TIMEOUT]
print('relay-long-budget-ok')
`;
const relay = await new Promise((done, fail) => {
  const child = spawn("python3", ["-c", relayContract, resolve(root, "harness/disposable/runtime.py")]);
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail); child.on("close", (code) => done({ code, stdout, stderr }));
});
assert.deepEqual(relay, { code: 0, stdout: "relay-long-budget-ok\n", stderr: "" });

const dockerfile = await readFile(resolve(root, "harness/disposable/Dockerfile"), "utf8");
assert.match(dockerfile, /apt-get install[^\n]*\bripgrep\b[^\n]*\bfd-find\b/);
assert.match(dockerfile, /ln -s \/usr\/bin\/fdfind \/usr\/local\/bin\/fd/);
console.log("ok - long runtime budget disables retries and declares offline tool dependencies");
