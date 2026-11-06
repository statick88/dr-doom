import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { relative, sep } from "node:path";
import { spawn } from "node:child_process";

export const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
export const LAB_IMAGE = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
export const MAX_OUTPUT_BYTES = 16 * 1024;
export const LAB_TIMEOUT_MS = 30_000;
const LOCAL_DOCKER = "unix:///var/run/docker.sock";
const DOCKER_PREFIX = [`--host=${LOCAL_DOCKER}`];
const RECEIPT_LIFETIME_MS = 5 * 60 * 1000;

export function decideToolCall({ toolName, hasUI, approved }) {
  if (READ_ONLY_TOOLS.has(toolName) || toolName === "lab_exec") return { allow: true };
  if (toolName === "bash") {
    if (!hasUI) return { allow: false, reason: "Host shell blocked: no interactive UI for exact approval." };
    if (approved === true) return { allow: true };
    if (approved === false) return { allow: false, reason: "Host shell blocked: approval declined." };
    return { allow: false, reason: "Host shell requires declared target, scope, a fresh local receipt, and exact approval." };
  }
  if (toolName.startsWith("mcp__")) return { allow: false, reason: "MCP actions are disabled; no trusted read-only MCP surface is verified." };
  return { allow: false, reason: `Tool ${toolName} is not permitted by the controlled profile.` };
}

function under(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.includes(`${sep}..${sep}`));
}

export async function validateLabRequest({ image, command, workspace, workspaceRoot }) {
  if (typeof image !== "string" || !LAB_IMAGE.test(image)) return { allow: false, reason: "Lab image must be a locally available digest-pinned image (name@sha256:<64 hex>)." };
  if (!Array.isArray(command) || command.length === 0 || command.length > 32 || command.some((part) => typeof part !== "string" || !part || part.length > 1024)) return { allow: false, reason: "Lab command must be a bounded argv array." };
  try {
    const [root, selected] = await Promise.all([realpath(workspaceRoot), realpath(workspace)]);
    if (!under(root, selected)) return { allow: false, reason: "Lab workspace resolves outside the dedicated workspace root." };
    return { allow: true, workspace: selected };
  } catch { return { allow: false, reason: "Lab workspace must exist and resolve inside the dedicated workspace root." }; }
}

export function buildDockerArgs({ image, command, workspace, containerId }) {
  return [...DOCKER_PREFIX, "run", "--name", containerId, "--rm", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534", "--pids-limit=64", "--cpus=1", "--memory=512m", "--tmpfs=/tmp:rw,noexec,nosuid,size=64m", "--mount", `type=bind,src=${workspace},dst=/work`, "--workdir=/work", image, ...command];
}

export async function runWithTimeout(start, timeoutMs = LAB_TIMEOUT_MS) {
  const child = start();
  return await new Promise((resolveResult) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolveResult(result); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ timedOut: true, code: null }); }, timeoutMs);
    child.once("error", (error) => finish({ timedOut: false, code: null, error: error.message }));
    child.once("close", (code) => finish({ timedOut: false, code }));
  });
}

function remoteDockerEnvironment(env) {
  return ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG"].find((key) => env[key]);
}
function dockerOptions(env, stdio) { return { stdio, env: { PATH: env.PATH ?? "" } }; }
async function cleanupContainer(containerId, spawnImpl, env) {
  const result = await runWithTimeout(() => spawnImpl("docker", [...DOCKER_PREFIX, "rm", "--force", containerId], dockerOptions(env, "ignore")), 5_000);
  return { attempted: true, ok: !result.timedOut && result.code === 0, ...result };
}

export async function hashWorkspace(workspace) {
  const hash = createHash("sha256"); let bytes = 0;
  async function visit(dir, prefix = "") {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`; const name = `${prefix}${entry.name}`; const stat = await lstat(path);
      if (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile())) throw new Error("workspace contains unsupported or symlinked artifact");
      hash.update(`${stat.isDirectory() ? "d" : "f"}:${name}\0`);
      if (stat.isDirectory()) await visit(path, `${name}/`);
      else { bytes += stat.size; if (bytes > 1024 * 1024) throw new Error("workspace artifact exceeds receipt bound"); hash.update(await readFile(path)); }
    }
  }
  await visit(workspace); return hash.digest("hex");
}

export function createReceiptRegistry() { return new Map(); }
export async function issueReceipt(registry, result) {
  if (!result.allow || result.code !== 0 || result.timedOut || result.cleanup !== "not-needed") return { allow: false, reason: "A receipt requires a successful completed restricted lab run." };
  try {
    const artifactHash = await hashWorkspace(result.workspace);
    const issuedAt = Date.now();
    const receipt = { id: randomUUID(), image: result.image, command: [...result.command], workspace: result.workspace, code: result.code, cleanup: result.cleanup, output: (result.output ?? "").slice(0, MAX_OUTPUT_BYTES), artifactHash, issuedAt, expiresAt: issuedAt + RECEIPT_LIFETIME_MS, consumed: false };
    registry.set(receipt.id, receipt); return { allow: true, receipt };
  } catch { return { allow: false, reason: "Lab artifact could not be bound to a receipt." }; }
}
export async function validateHostApproval({ command, cwd, target, scope, evidence, registry, consume = false }) {
  if (![command, cwd, target, scope, evidence].every((value) => typeof value === "string" && value.trim())) return { allow: false, reason: "Host shell blocked: declared target, scope, and receipt are required." };
  const receipt = registry.get(evidence);
  if (!receipt) return { allow: false, reason: "Host shell blocked: evidence is not a harness-issued local receipt." };
  if (receipt.consumed) return { allow: false, reason: "Host shell blocked: local receipt was already used." };
  if (Date.now() >= receipt.expiresAt) return { allow: false, reason: "Host shell blocked: local receipt expired after five minutes." };
  try { if (await hashWorkspace(receipt.workspace) !== receipt.artifactHash) return { allow: false, reason: "Host shell blocked: local receipt artifact changed." }; }
  catch { return { allow: false, reason: "Host shell blocked: local receipt artifact cannot be verified." }; }
  if (Date.now() >= receipt.expiresAt) return { allow: false, reason: "Host shell blocked: local receipt expired after five minutes." };
  if (consume) {
    if (receipt.consumed) return { allow: false, reason: "Host shell blocked: local receipt was already used." };
    receipt.consumed = true;
  }
  return { allow: true, payload: JSON.stringify({ command, cwd, target, scope, evidence }), receipt };
}

export async function runRestrictedLab({ image, command, workspace, workspaceRoot, spawnImpl = spawn, env = process.env }) {
  const remoteKey = remoteDockerEnvironment(env);
  if (remoteKey) return { allow: false, reason: `Docker runtime unavailable: ${remoteKey} selects an inherited non-local Docker configuration.` };
  const validation = await validateLabRequest({ image, command, workspace, workspaceRoot });
  if (!validation.allow) return validation;
  const inspect = await runWithTimeout(() => spawnImpl("docker", [...DOCKER_PREFIX, "image", "inspect", image], dockerOptions(env, "ignore")), 5_000);
  if (inspect.timedOut || inspect.code !== 0) return { allow: false, reason: "Pinned image is unavailable locally; choose an explicitly approved image installation or stop." };
  const containerId = `harness-lab-${randomUUID()}`;
  const args = buildDockerArgs({ image, command, workspace: validation.workspace, containerId });
  let output = "";
  const child = spawnImpl("docker", args, dockerOptions(env, ["ignore", "pipe", "pipe"]));
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => { if (output.length < MAX_OUTPUT_BYTES) output += chunk.toString().slice(0, MAX_OUTPUT_BYTES - output.length); });
  const result = await runWithTimeout(() => child);
  if (result.timedOut || result.code !== 0 || result.error) {
    const cleanup = await cleanupContainer(containerId, spawnImpl, env);
    if (!cleanup.ok) return { allow: false, ...result, output, args, containerId, cleanup, reason: `Lab cleanup may have orphaned ${containerId}; daemon cleanup failed.` };
    return { allow: false, ...result, output, args, containerId, cleanup };
  }
  return { allow: true, ...result, output, args, image, command: [...command], workspace: validation.workspace, containerId, cleanup: "not-needed" };
}
