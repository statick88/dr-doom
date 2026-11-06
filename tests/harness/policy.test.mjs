import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decideToolCall,
  createReceiptRegistry,
  issueReceipt,
  validateHostApproval,
  validateLabRequest,
  buildDockerArgs,
  runWithTimeout,
} from "../../harness/policy.js";

const cases = [];
const scratch = [];
const scratchDir = async (prefix) => { const path = await mkdtemp(join(tmpdir(), prefix)); scratch.push(path); return path; };
const test = (name, fn) => cases.push([name, fn]);

test("denies host shell without an interactive UI", () =>
  assert.match(decideToolCall({ toolName: "bash", hasUI: false }).reason, /no interactive UI/i));
test("denies a declined host-shell confirmation", () =>
  assert.match(decideToolCall({ toolName: "bash", hasUI: true, approved: false }).reason, /declined/i));
test("requires scope and a harness receipt before host-shell approval", async () =>
  assert.match((await validateHostApproval({ command: "true", cwd: "/lab", target: "local", scope: "", evidence: "", registry: createReceiptRegistry() })).reason, /scope.*receipt/i));
test("blocks unsupported mutation and all MCP tools", () => {
  assert.equal(decideToolCall({ toolName: "write", hasUI: true }).allow, false);
  assert.equal(decideToolCall({ toolName: "mcp__anything__run", hasUI: true }).allow, false);
});
test("allows only declared read-only tools", () => {
  assert.equal(decideToolCall({ toolName: "read", hasUI: false }).allow, true);
  assert.equal(decideToolCall({ toolName: "unknown", hasUI: false }).allow, false);
});
test("requires a valid digest-pinned image", async () => {
  const root = await scratchDir("policy-red-");
  await mkdir(join(root, "workspace"));
  for (const image of ["alpine:latest", "not an image@sha256:" + "a".repeat(64)]) {
    const result = await validateLabRequest({ image, command: ["id"], workspace: join(root, "workspace"), workspaceRoot: join(root, "workspace") });
    assert.match(result.reason, /digest-pinned/i);
  }
});
test("rejects a symlink workspace escape", async () => {
  const root = await scratchDir("policy-red-");
  const outside = await scratchDir("policy-outside-");
  await mkdir(join(root, "workspace"));
  await symlink(outside, join(root, "workspace", "escape"));
  const result = await validateLabRequest({ image: "example@sha256:" + "a".repeat(64), command: ["id"], workspace: join(root, "workspace", "escape"), workspaceRoot: join(root, "workspace") });
  assert.match(result.reason, /workspace/i);
});
test("constructs Docker argv with isolation restrictions", () => {
  const args = buildDockerArgs({ image: "example@sha256:" + "a".repeat(64), command: ["id"], workspace: "/tmp/lab" });
  for (const required of ["--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534", "--rm"]) assert.ok(args.includes(required), required);
  assert.equal(args.includes("--privileged"), false);
  assert.equal(args[args.indexOf("--mount") + 1], "type=bind,src=/tmp/lab,dst=/work");
});
test("approval payload binds exact declared action to a fresh receipt", async () => {
  const root = await scratchDir("policy-receipt-"); const workspace = join(root, "workspace");
  await mkdir(workspace); await writeFile(join(workspace, "artifact"), "local");
  const registry = createReceiptRegistry();
  const issued = await issueReceipt(registry, { allow: true, code: 0, timedOut: false, cleanup: "not-needed", image: "example@sha256:" + "a".repeat(64), command: ["id"], workspace, output: "ok" });
  const approval = await validateHostApproval({ command: "python check.py", cwd: "/lab", target: "lab.local", scope: "lab only", evidence: issued.receipt.id, registry });
  assert.equal(approval.allow, true);
  assert.equal(approval.payload, JSON.stringify({ command: "python check.py", cwd: "/lab", target: "lab.local", scope: "lab only", evidence: issued.receipt.id }));
});
test("times out and cleans up fake process", async () => {
  let killed = false;
  const child = { stdout: null, stderr: null, kill: () => { killed = true; }, once: () => child };
  const result = await runWithTimeout(() => child, 1);
  assert.equal(result.timedOut, true);
  assert.equal(killed, true);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}\n${error.stack}`); }
}
await Promise.all(scratch.map((path) => rm(path, { recursive: true, force: true })));
process.exitCode = failed ? 1 : 0;
