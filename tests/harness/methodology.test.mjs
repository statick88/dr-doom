import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-methodology-"));
const run = (file, args) => new Promise((done, fail) => {
  const child = spawn(file, args, { cwd: scratch, env: process.env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail);
  child.on("close", (code) => done({ code, stdout, stderr }));
});

try {
  const help = await run(join(root, "doom"), ["--help"]);
  assert.equal(help.code, 0);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /no monta el directorio actual/i);
  assert.match(help.stdout, /dr-doom-gentle:4\.6\.0/);

  const harnessHelp = await run(join(root, "pi-harness.sh"), ["--help"]);
  assert.equal(harnessHelp.code, 0);
  assert.equal(harnessHelp.stderr, "");
  assert.match(harnessHelp.stdout, /Usage: \.\/pi-harness\.sh \[Pi arguments\]/);
  assert.match(harnessHelp.stdout, /Host shell requires interactive exact approval/);

  const guidance = await run("grep", ["-q", "Existing harness policy remains the mechanical control", join(root, "harness/skills/scoped-redteam/methodology.md")]);
  assert.equal(guidance.code, 0, "legacy launcher guidance remains present");
  console.log("ok - doom uses disposable contract and legacy launcher stays isolated");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
