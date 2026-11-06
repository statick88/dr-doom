import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-flows-"));
const fixture = join(scratch, "fixture");
const run = (file, args, env = {}) => new Promise((done, fail) => {
  const child = spawn(file, args, { cwd: scratch, env: { ...process.env, ...env } });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail);
  child.on("close", (code) => done({ code, stdout, stderr }));
});

try {
  await cp(join(root, "harness/disposable/entrypoint.sh"), join(scratch, "entrypoint.sh"));
  const entrypoint = join(scratch, "entrypoint.sh");
  const isolated = (await readFile(entrypoint, "utf8"))
    .replaceAll("/opt/doom", fixture)
    .replaceAll("/tmp/home", join(scratch, "home"))
    .replaceAll("/tmp/doom-system.md", join(scratch, "doom-system.md"))
    .replace("cd /workspace", `cd "${scratch}"`);
  assert.doesNotMatch(isolated, /\/tmp\/home|\/tmp\/doom-system\.md|\/opt\/doom|cd \/workspace/);
  await writeFile(entrypoint, isolated);
  await mkdir(join(fixture, "config"), { recursive: true });
  await mkdir(join(fixture, "themes"), { recursive: true });
  await mkdir(join(fixture, "skills"), { recursive: true });
  await writeFile(join(fixture, "config/settings.json"), "{}");
  await writeFile(join(fixture, "config/models.json"), "{}");
  await writeFile(join(fixture, "themes/dr-doom.json"), "{}");
  await cp(join(root, "harness/disposable/guidance.md"), join(fixture, "guidance.md"));
  await cp(join(root, "harness/disposable/skills"), join(fixture, "skills"), { recursive: true });
  await mkdir(join(fixture, "node_modules/.bin"), { recursive: true });
  await writeFile(join(scratch, "node"), "#!/bin/sh\nexit 0\n");
  await writeFile(join(fixture, "node_modules/.bin/pi"), `#!/bin/sh
prompt=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--append-system-prompt" ]; then prompt="$2"; shift 2; continue; fi
  printf 'ARG:%s\\n' "$1"
  shift
done
printf '%s\\n' 'GUIDANCE-BEGIN'
/bin/cat "$prompt"
printf '%s\\n' 'GUIDANCE-END'
`);
  await run("chmod", ["+x", join(scratch, "node"), join(fixture, "node_modules/.bin/pi"), entrypoint]);

  for (const flow of ["ctf", "pentest", "redteam"]) {
    const result = await run(entrypoint, ["--flow", flow, "-p", "tarea del usuario", "--flag"], { PATH: `${scratch}:${process.env.PATH}`, DOOM_MODEL_SOCKET: "model.sock" });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(await readFile(join(scratch, "home/.pi/agent/models.json"), "utf8")), {});
    assert.match(await readFile(join(scratch, "doom-system.md"), "utf8"), /Dr\. Doom/);
    const args = result.stdout.match(/^ARG:.*$/gm);
    assert.deepEqual(args.slice(-3), ["ARG:-p", "ARG:tarea del usuario", "ARG:--flag"], `${flow}: conserva argumentos del usuario`);
    assert.ok(result.stdout.indexOf("ARG:--append-system-prompt") < result.stdout.indexOf("ARG:tarea del usuario"), `${flow}: guía antes de la tarea`);
    assert.match(result.stdout, new RegExp(`GUIDANCE-BEGIN[\\s\\S]*# ${flow === "ctf" ? "CTF" : flow === "pentest" ? "Pentest" : "Red team"}[\\s\\S]*GUIDANCE-END`));
    const template = await readFile(join(root, "harness/disposable/prompts", `${flow}.md`), "utf8");
    assert.doesNotMatch(template, /\/skill:/, `${flow}: plantilla sin expansión anidada`);
    assert.doesNotMatch(result.stdout, new RegExp(`ARG:/${flow}`), `${flow}: no encola un mensaje de flujo`);
  }
  console.log("ok - flujos directamente invocables preceden la tarea sin expansión anidada");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
