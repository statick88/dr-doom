import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReceiptRegistry, issueReceipt, runRestrictedLab, validateHostApproval } from "../../harness/policy.js";

const root = await mkdtemp(join(tmpdir(), "harness-correction-"));
const workspace = join(root, "workspace");
await mkdir(workspace);
await writeFile(join(workspace, "artifact.txt"), "before");
const image = "example@sha256:" + "a".repeat(64);
const calls = [];
const child = (close, error) => {
  const result = new EventEmitter();
  result.stdout = new PassThrough(); result.stderr = new PassThrough();
  result.kill = () => true;
  queueMicrotask(() => error ? result.emit("error", new Error("run failed")) : result.emit("close", close));
  return result;
};
const fakeSpawn = (_file, args, options) => { calls.push({ args, options }); return child(args.includes("inspect") ? 0 : 1); };

const remote = await runRestrictedLab({ image, command: ["id"], workspace, workspaceRoot: root, spawnImpl: fakeSpawn, env: { DOCKER_HOST: "tcp://remote.example:2375" } });
assert.equal(remote.allow, false);
assert.equal(calls.length, 0, "remote Docker environment must spawn nothing");

const timedCalls = [];
const hanging = () => { const result = new EventEmitter(); result.stdout = new PassThrough(); result.stderr = new PassThrough(); result.kill = () => true; return result; };
const timeoutSpawn = (_file, args, options) => { timedCalls.push({ args, options }); return args.includes("inspect") ? child(0) : args.includes("rm") ? child(0) : hanging(); };
const oldSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => oldSetTimeout(fn, Math.min(ms, 2), ...args);
const timeout = await runRestrictedLab({ image, command: ["sleep", "60"], workspace, workspaceRoot: root, spawnImpl: timeoutSpawn, env: {} });
globalThis.setTimeout = oldSetTimeout;
assert.equal(timeout.allow, false);
assert.equal(timeout.timedOut, true);
assert.equal(timedCalls.filter(({ args }) => args.includes("rm")).length, 1);
for (const { args, options } of timedCalls) {
  assert.equal(args[0], "--host=unix:///var/run/docker.sock");
  assert.equal(options.env.DOCKER_HOST, undefined);
}
const runArgs = timedCalls.find(({ args }) => args.includes("run")).args;
const cleanupArgs = timedCalls.find(({ args }) => args.includes("rm")).args;
assert.equal(runArgs[runArgs.indexOf("--name") + 1], cleanupArgs.at(-1));

const errorCalls = [];
const errorSpawn = (_file, args, options) => { errorCalls.push({ args, options }); return args.includes("inspect") || args.includes("rm") ? child(0) : child(null, true); };
const errored = await runRestrictedLab({ image, command: ["false"], workspace, workspaceRoot: root, spawnImpl: errorSpawn, env: {} });
assert.equal(errored.allow, false);
assert.equal(errorCalls.filter(({ args }) => args.includes("rm")).length, 1, "run errors require owned daemon cleanup");

const failedCleanupCalls = [];
const cleanupFailureSpawn = (_file, args, options) => { failedCleanupCalls.push({ args, options }); return args.includes("inspect") ? child(0) : args.includes("rm") ? child(1) : hanging(); };
globalThis.setTimeout = (fn, ms, ...args) => oldSetTimeout(fn, Math.min(ms, 2), ...args);
const cleanupFailed = await runRestrictedLab({ image, command: ["sleep", "60"], workspace, workspaceRoot: root, spawnImpl: cleanupFailureSpawn, env: {} });
globalThis.setTimeout = oldSetTimeout;
assert.equal(cleanupFailed.allow, false);
assert.match(cleanupFailed.reason, /orphaned harness-lab-/);
assert.equal(cleanupFailed.cleanup.ok, false);

const registry = createReceiptRegistry();
assert.equal((await issueReceipt(registry, { allow: false, code: 1, timedOut: false, cleanup: "not-needed", image, command: ["false"], workspace })).allow, false);
assert.equal((await issueReceipt(registry, { allow: false, code: null, timedOut: true, cleanup: { attempted: true, ok: true }, image, command: ["sleep"], workspace })).allow, false);
const issued = await issueReceipt(registry, { allow: true, code: 0, timedOut: false, cleanup: "not-needed", image, command: ["id"], workspace, output: "local output" });
assert.equal(issued.allow, true);
for (const evidence of ["x", issued.receipt.id]) {
  const approval = await validateHostApproval({ command: "printf ACTUAL", cwd: "/trusted/cwd", target: "remote.example", scope: "one host", evidence, registry });
  assert.equal(approval.allow, evidence === issued.receipt.id);
}
const originalNow = Date.now;
let now = 1_000;
Date.now = () => now;
const expiring = await issueReceipt(registry, { allow: true, code: 0, timedOut: false, cleanup: "not-needed", image, command: ["id"], workspace, output: "local output" });
now += 5 * 60 * 1000;
assert.equal((await validateHostApproval({ command: "printf ACTUAL", cwd: "/trusted/cwd", target: "remote.example", scope: "one host", evidence: expiring.receipt.id, registry })).allow, false, "receipt expires at the five-minute boundary");
const singleUse = await issueReceipt(registry, { allow: true, code: 0, timedOut: false, cleanup: "not-needed", image, command: ["id"], workspace, output: "local output" });
const request = { command: "printf ACTUAL", cwd: "/trusted/cwd", target: "remote.example", scope: "one host", evidence: singleUse.receipt.id, registry, consume: true };
assert.equal((await validateHostApproval(request)).allow, true);
assert.equal((await validateHostApproval(request)).allow, false, "a consumed receipt cannot replay");
const concurrent = await issueReceipt(registry, { allow: true, code: 0, timedOut: false, cleanup: "not-needed", image, command: ["id"], workspace, output: "local output" });
const results = await Promise.all([0, 1].map(() => validateHostApproval({ ...request, evidence: concurrent.receipt.id })));
assert.equal(results.filter((result) => result.allow).length, 1, "concurrent consumption admits exactly one host action");
Date.now = originalNow;

await writeFile(join(workspace, "artifact.txt"), "changed");
assert.equal((await validateHostApproval({ command: "printf ACTUAL", cwd: "/trusted/cwd", target: "remote.example", scope: "one host", evidence: issued.receipt.id, registry })).allow, false);

await rm(root, { recursive: true, force: true });
console.log("ok - remote Docker denied, owned timeout cleanup, and receipt freshness enforced");
