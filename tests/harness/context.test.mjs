import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-context-"));
const run = (file, args) => new Promise((done, fail) => {
  const child = spawn(file, args, { cwd: scratch, env: process.env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail);
  child.on("close", (code) => done({ code, stdout, stderr }));
});

try {
  const launcher = await readFile(join(root, "server.sh"));
  await writeFile(join(scratch, "server.sh"), launcher, { mode: 0o755 });
  await chmod(join(scratch, "server.sh"), 0o755);
  await mkdir(join(scratch, "runtime/build/bin"), { recursive: true });
  await writeFile(join(scratch, "runtime/build/bin/llama-server"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$(dirname \"$0\")/../../../called\"\n", { mode: 0o755 });
  await chmod(join(scratch, "runtime/build/bin/llama-server"), 0o755);

  const help = await run(join(scratch, "server.sh"), ["--help"]);
  assert.deepEqual(help, {
    code: 0,
    stdout: "Usage: ./server.sh\nRun the local CPU-only Qwen3 server on 127.0.0.1:18080; stop with Ctrl+C.\n",
    stderr: ""
  });

  const invalid = await run(join(scratch, "server.sh"), ["unexpected"]);
  assert.deepEqual(invalid, { code: 2, stdout: "", stderr: "Unexpected arguments. Use --help.\n" });
  await assert.rejects(readFile(join(scratch, "called")));

  const launched = await run(join(scratch, "server.sh"), []);
  assert.deepEqual(launched, { code: 0, stdout: "", stderr: "" });
  assert.deepEqual((await readFile(join(scratch, "called"), "utf8")).trim().split("\n"), [
    "--model", join(scratch, "models/qwen3-8b-abliterated-Q4_K_M.gguf"),
    "--alias", "qwen3-8b-redteam", "--host", "127.0.0.1", "--port", "18080",
    "--ctx-size", "32768", "--parallel", "1", "--threads", "4", "--threads-batch", "4",
    "--n-gpu-layers", "0", "--jinja", "--chat-template-kwargs", "{\"enable_thinking\":false}"
  ]);

  const lock = JSON.parse(await readFile(join(root, "model-lock.json"), "utf8"));
  const models = JSON.parse(await readFile(join(root, "harness/disposable/config/models.json"), "utf8"));
  assert.equal(lock.context, 32768);
  assert.equal(models.providers["local-redteam"].models[0].contextWindow, 32768);
  assert.equal(models.providers["local-redteam"].models[0].maxTokens, 2048);
  assert.deepEqual(lock.model, {
    repository: "richardyoung/Qwen3-8B-Abliterated-GGUF",
    revision: "2560f8f68b43958264748da68f2eda164ff61419",
    file: "qwen3-8b-abliterated-Q4_K_M.gguf",
    size: 5027784032,
    sha256: "8625e48da4c4be9bcba2414fd8cad4095ff3a538d5b0111c2b26b5f6209538b9",
    license: "apache-2.0"
  });
  assert.deepEqual(lock.runtime, {
    repository: "https://github.com/ggml-org/llama.cpp.git",
    tag: "v0.7.0", backend: "CPU",
    build: "cmake --build runtime/build --config Release -j 4 --target llama-server",
    commit: "620d2225cc436ab0b001e3200e590e3b286ef9ab",
    source_archive_sha256: "1d4a987d9bd048f6e93107e838026438df70fbde237fc0c69c63d600512b4bd9"
  });

  const guidance = await readFile(join(root, "harness/disposable/guidance.md"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");
  const workflows = await readFile(join(root, "docs/doom-workflows.md"), "utf8");
  assert.match(guidance, /contexto de 32768/);
  assert.match(readme, /32768 \/ 2048 tokens/);
  for (const document of [readme, workflows]) {
    assert.ok(/32K/.test(document) && /full harness; no reduced harness/i.test(document), "document the full 32K profile, not a reduced substitute");
    assert.match(document, /one.*synthetic.*scenario/i, "scope acceptance to the observed synthetic scenario");
    assert.match(document, /independent/i, "record independent evidence review");
    assert.match(document, /interactive performance.*not accepted|not accepted interactive performance/i,
      "do not turn a functional pass into performance acceptance");
    assert.match(document, /resource-dependent/i, "keep performance resource-dependent");
  }
  console.log("ok - local 32K context contract stays consistent");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
