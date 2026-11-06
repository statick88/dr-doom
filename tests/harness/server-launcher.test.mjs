import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const project = resolve(import.meta.dirname, "../..");
const root = await mkdtemp(join(tmpdir(), "doom-server-launcher-"));
const run = (file, args, env) => new Promise((resolveRun, reject) => {
  const child = spawn(file, args, { cwd: root, env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolveRun({ code, stdout, stderr }));
});

try {
  const bin = join(root, "runtime/build/bin");
  const models = join(root, "models");
  await mkdir(bin, { recursive: true });
  await mkdir(models);
  await copyFile(join(project, "server.sh"), join(root, "server.sh"));
  await chmod(join(root, "server.sh"), 0o755);
  const model = join(models, "qwen3-8b-abliterated-Q4_K_M.gguf");
  await writeFile(model, "synthetic-model-placeholder\n");
  const backend = join(bin, "llama-server");
  await writeFile(backend, `#!/usr/bin/env bash
printf '%s' "$LD_LIBRARY_PATH" > "$ROOT_OBSERVED_ENV"
printf '%s\\0' "$@" > "$ROOT_OBSERVED_ARGV"
printf 'synthetic backend stdout\\n'
printf 'synthetic backend stderr\\n' >&2
exit 7
`);
  await chmod(backend, 0o755);

  const serverBefore = await readFile(join(root, "server.sh"));
  const modelBefore = await readFile(model);
  const parentLoader = process.env.LD_LIBRARY_PATH;
  const observedEnv = join(root, "observed-env");
  const observedArgv = join(root, "observed-argv");
  const existing = "/synthetic/existing/lib";
  const result = await run(join(root, "server.sh"), [], {
    ...process.env,
    LD_LIBRARY_PATH: existing,
    ROOT_OBSERVED_ENV: observedEnv,
    ROOT_OBSERVED_ARGV: observedArgv,
  });

  assert.deepEqual(result, {
    code: 7,
    stdout: "synthetic backend stdout\n",
    stderr: "synthetic backend stderr\n",
  });
  assert.equal(await readFile(observedEnv, "utf8"), `${bin}:${existing}`);
  const argv = (await readFile(observedArgv)).toString().split("\0").filter(Boolean);
  assert.deepEqual(argv, [
    "--model", model,
    "--alias", "qwen3-8b-redteam", "--host", "127.0.0.1", "--port", "18080",
    "--ctx-size", "32768", "--parallel", "1", "--threads", "4", "--threads-batch", "4",
    "--n-gpu-layers", "0", "--jinja",
    "--chat-template-kwargs", '{"enable_thinking":false}',
  ]);
  assert.equal(process.env.LD_LIBRARY_PATH, parentLoader);
  assert.deepEqual(await readFile(join(root, "server.sh")), serverBefore);
  assert.deepEqual(await readFile(model), modelBefore);

  const help = await run(join(root, "server.sh"), ["--help"], { ...process.env });
  assert.deepEqual(help, {
    code: 0,
    stdout: "Usage: ./server.sh\nRun the local CPU-only Qwen3 server on 127.0.0.1:18080; stop with Ctrl+C.\n",
    stderr: "",
  });
  const rejected = await run(join(root, "server.sh"), ["unexpected"], { ...process.env });
  assert.deepEqual(rejected, { code: 2, stdout: "", stderr: "Unexpected arguments. Use --help.\n" });
  console.log("ok - server launcher uses its current trusted build directory and preserves the CPU profile");
} finally {
  await rm(root, { recursive: true, force: true });
}
