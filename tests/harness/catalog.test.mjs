import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(join(tmpdir(), "doom-catalog-"));
const preEditDoom = join(scratch, "doom-pre-edit");
const tracked = ["harness/catalog/snapshot.json", "model-lock.json", "pi-local.sh", "server.sh"];
const digest = async (path) => createHash("sha256").update(await readFile(join(root, path))).digest("hex");
const before = await Promise.all(tracked.map(digest));

const run = (file, args, env = {}) => new Promise((done, fail) => {
  const child = spawn(file, args, { cwd: scratch, env: { ...process.env, ...env } });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", fail);
  child.on("close", (code) => done({ code, stdout, stderr }));
});

try {
  await writeFile(preEditDoom, `#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
usage() {
  cat <<'EOF'
Uso: doom [ctf|pentest|redteam] [argumentos de Pi]
Inicia el arnés Gentle completo con tema Dr. Doom en un contenedor desechable.
Sin flujo, quedan disponibles /ctf, /pentest y /redteam.
No monta el directorio actual: el trabajo queda en harness/doom-workspace.
Requisito: ./server.sh ya debe atender en 127.0.0.1:18080.
Construye la imagen una vez: docker build -t dr-doom-gentle:4.6.0 -f harness/disposable/Dockerfile .
EOF
}
case "\${1:-}" in
  -h|--help) usage; exit 0 ;;
  ctf|pentest|redteam) flow="$1"; shift ;;
  "") flow="" ;;
  -*) flow="" ;;
  *) printf 'doom: flujo no válido: %s (usa ctf, pentest o redteam)\\n' "$1" >&2; exit 2 ;;
esac
exec python3 "$root/harness/disposable/runtime.py" --root "$root" \${flow:+--flow "$flow"} -- "$@"
`);
  await writeFile(join(scratch, "python3"), `#!/usr/bin/env sh
next=0
out=''
for arg do
  if [ "$next" = 1 ]; then arg='<root>'; next=0
  elif [ "$arg" = --root ]; then next=1
  elif [ "\${arg%/harness/disposable/runtime.py}" != "$arg" ]; then arg='<runtime>'
  fi
  out="$out\${out:+ }$arg"
done
printf 'PYTHON:%s\\n' "$out"
`);
  await writeFile(join(scratch, "docker"), "#!/usr/bin/env sh\nprintf 'DOCKER CALLED\\n' >&2\nexit 99\n");
  await run("chmod", ["+x", preEditDoom, join(scratch, "python3"), join(scratch, "docker")]);
  const mockPath = `${scratch}:${process.env.PATH}`;

  const list = await run(join(root, "doom"), ["catalogo"]);
  assert.equal(list.code, 0);
  assert.equal(list.stderr, "");
  assert.equal(list.stdout.startsWith([
    "Catálogo offline de proveedores (31).",
    "Fuente: https://github.com/open-free-llm-api/awesome-freellm-apis",
    "Revisión: d04877f798520a680a0a954ced5a6ee5514406c0",
    "Fecha del snapshot: 2026-10-24",
    "Aviso: datos declarados por upstream; límites, disponibilidad, costos y privacidad no están verificados. El catálogo no contacta servicios.",
    "Proveedor | URL base | URL de clave | Requisitos | Modelos gratis declarados | Contexto máximo declarado | Categoría upstream",
    "NVIDIA NIM | https://integrate.api.nvidia.com/v1 | https://build.nvidia.com/settings/api-keys | Phone verification | 137 | 1M | free-tier-claim",
    "",
  ].join("\n")), true);
  assert.equal(list.stdout.split("\n").filter(Boolean).length, 37);
  assert.match(list.stdout, /^Cline \| no publicado \| no publicado \| Registration \| 5 \| 0 \| free-tier-claim$/m);
  assert.match(list.stdout, /^Grok \(xAI\) \| https:\/\/api\.x\.ai\/v1 \| https:\/\/console\.x\.ai\/ \| Registration \| 2 \| 131K \| free-tier-claim$/m);

  const filtered = await run(join(root, "doom"), ["catalogo", "gRoK"]);
  assert.deepEqual(filtered, {
    code: 0,
    stdout: [
      "Catálogo offline de proveedores (1 de 31).",
      "Fuente: https://github.com/open-free-llm-api/awesome-freellm-apis",
      "Revisión: d04877f798520a680a0a954ced5a6ee5514406c0",
      "Fecha del snapshot: 2026-10-24",
      "Aviso: datos declarados por upstream; límites, disponibilidad, costos y privacidad no están verificados. El catálogo no contacta servicios.",
      "Proveedor | URL base | URL de clave | Requisitos | Modelos gratis declarados | Contexto máximo declarado | Categoría upstream",
      "Grok (xAI) | https://api.x.ai/v1 | https://console.x.ai/ | Registration | 2 | 131K | free-tier-claim",
      "",
    ].join("\n"),
    stderr: "",
  });
  const absent = await run(join(root, "doom"), ["catalogo", "no existe"]);
  assert.deepEqual(absent, { code: 2, stdout: "", stderr: "doom: no hay proveedores que coincidan con: no existe\n" });
  const arity = await run(join(root, "doom"), ["catalogo", "uno", "dos"]);
  assert.deepEqual(arity, { code: 2, stdout: "", stderr: "doom: catalogo acepta como máximo un filtro de nombre\n" });
  const help = await run(join(root, "doom"), ["catalogo", "--help"]);
  assert.deepEqual(help, {
    code: 0,
    stdout: "Uso: doom catalogo [filtro]\nMuestra el catálogo offline local; filtra por nombre sin distinguir mayúsculas.\nNo configura ni contacta proveedores, ni cambia el modelo local.\n",
    stderr: "",
  });

  const fixture = join(scratch, "catalog-fixture");
  await mkdir(fixture);
  for (const file of ["list.py", "snapshot.json", "LICENSE.upstream"])
    await cp(join(root, "harness/catalog", file), join(fixture, file));
  const fixtureSnapshot = join(fixture, "snapshot.json");
  const malformed = JSON.parse(await readFile(fixtureSnapshot, "utf8"));
  malformed.providers[0].baseUrl = { malformed: true };
  await writeFile(fixtureSnapshot, JSON.stringify(malformed));
  const malformedBefore = createHash("sha256").update(await readFile(fixtureSnapshot)).digest("hex");
  const invalidCatalog = await run("python3", [join(fixture, "list.py")]);
  assert.deepEqual(invalidCatalog, { code: 1, stdout: "", stderr: "doom: catálogo local no disponible\n" });
  const malformedAfter = createHash("sha256").update(await readFile(fixtureSnapshot)).digest("hex");
  assert.equal(malformedAfter, malformedBefore, "un snapshot rechazado no deja trazas ni cambia la copia de prueba");

  const after = await Promise.all(tracked.map(digest));
  assert.deepEqual(after, before, "las consultas rechazadas no cambian datos, modelo ni configuración");
  for (const flow of ["ctf", "pentest", "redteam"]) {
    const current = await run(join(root, "doom"), [flow, "--prueba"], { PATH: mockPath });
    const prior = await run(preEditDoom, [flow, "--prueba"], { PATH: mockPath });
    assert.deepEqual(current, prior, `${flow}: despacho sin cambios`);
    assert.match(current.stdout, new RegExp(`--flow ${flow} -- --prueba`));
    assert.doesNotMatch(current.stderr, /DOCKER CALLED/);
  }
  console.log("ok - catálogo offline y flujos existentes verificados por interfaz pública");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
