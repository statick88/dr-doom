# Clean-clone installation

These are opt-in retrieval/build instructions, not permission to build or run inference automatically. One synthetic full-harness CPU model/read/final scenario was accepted; general workflow, thermal and interactive-performance acceptance remain pending. Do not run them over an existing runtime or service; use a fresh checkout. Review [third-party boundaries](third-party.md) first.

## Prerequisites

- Linux, Bash/POSIX shell, Git, curl, tar and SHA-256 utilities; Python 3 for `doom` and its relay.
- CMake, Unix Make, a C/C++ toolchain, system OpenSSL development headers/libraries and OpenMP support (for example GCC's OpenMP runtime). The CPU recipe uses native CPU instructions: rebuild on the destination machine, rather than copying its binaries to another CPU.
- Docker with a local Unix daemon and permission to run unprivileged containers. Image construction needs network access; normal `doom` containers have no external network.
- Disk space for the 5,027,784,032-byte model, source/build tree and container image, plus enough RAM for weights, 32K KV cache and full harness. Performance and memory needs are resource-dependent; no fixed RAM or latency guarantee is established.
- Host Node/npm are unnecessary for `doom`: the Dockerfile pins Node 24 Bookworm slim by digest, Pi 1.5.0 and Gentle 4.6.0 via the supplied lockfile. Host-only mock tests need compatible Node (the locked Pi engine declares >=22.19.0).

## Retrieve and verify

```bash
set -eu
git clone https://github.com/statick88/dr-doom.git
cd dr-doom
export DOOM_ROOT="$PWD"
mkdir -p downloads models runtime
curl --fail --location --output downloads/llama.cpp.tar.gz \
  https://codeload.github.com/ggml-org/llama.cpp/tar.gz/620d2225cc436ab0b001e3200e590e3b286ef9ab
printf '%s  %s\n' \
  1d4a987d9bd048f6e93107e838026438df70fbde237fc0c69c63d600512b4bd9 \
  downloads/llama.cpp.tar.gz | sha256sum --check -
# Continue only after the checksum succeeds; runtime must be a new empty directory.
tar -xzf downloads/llama.cpp.tar.gz --strip-components=1 -C runtime
curl --fail --location --output models/qwen3-8b-abliterated-Q4_K_M.gguf \
  https://huggingface.co/richardyoung/Qwen3-8B-Abliterated-GGUF/resolve/2560f8f68b43958264748da68f2eda164ff61419/qwen3-8b-abliterated-Q4_K_M.gguf
printf '%s  %s\n' \
  8625e48da4c4be9bcba2414fd8cad4095ff3a538d5b0111c2b26b5f6209538b9 \
  models/qwen3-8b-abliterated-Q4_K_M.gguf | sha256sum --check -
test "$(wc -c < models/qwen3-8b-abliterated-Q4_K_M.gguf)" -eq 5027784032
```

Stop on any download, checksum or size failure; do not extract/build/use failed artifacts. The URLs, hashes and byte count above correspond to `model-lock.json`. Integrity is not publisher trust or licensing verification. The recorded source tag is `v0.7.0`; the archive URL pins its recorded commit, not a moving branch.

## Configure and build the CPU server

The current recipe uses Unix Makefiles, Release, shared libraries, native CPU, OpenMP, llamafile/repack and system OpenSSL. It does not fetch optional backend dependencies.

```bash
cmake -S runtime -B runtime/build -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON \
  -DGGML_CPU=ON -DGGML_NATIVE=ON -DGGML_OPENMP=ON \
  -DGGML_OPENMP_FETCH=OFF -DGGML_LLAMAFILE=ON -DGGML_CPU_REPACK=ON \
  -DGGML_BACKEND_DL=OFF -DGGML_VULKAN=OFF \
  -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_APP=ON -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_MTMD=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_LLGUIDANCE=OFF -DLLAMA_OPENSSL=ON \
  -DFETCHCONTENT_FULLY_DISCONNECTED=ON -DFETCHCONTENT_UPDATES_DISCONNECTED=ON
cmake --build runtime/build --config Release -j 4 --target llama-server
```

Configure must find system OpenSSL and OpenMP; resolve missing prerequisites before building, not by silently changing backend or fetching dependencies. `server.sh` resolves shared libraries for its child process from the current checkout's `runtime/build/bin`, prefixing and preserving any existing `LD_LIBRARY_PATH`; it does not alter the parent shell or host loader configuration. This keeps a correctly built tree portable when the checkout moves, but does not validate or repair binaries. Vulkan preparation is intentionally outside this CPU-only experimental source snapshot; no GPU acceleration or thermal improvement is claimed.

## Build the disposable harness

```bash
# Use a new test tag; do not replace an installed/active image.
TEST_TAG="dr-doom-gentle:native-check-$(date +%s)"
docker build -t "$TEST_TAG" -f harness/disposable/Dockerfile .
```

The supplied `harness/disposable/package-lock.json` is the dependency input: the Dockerfile runs `npm ci --ignore-scripts --omit=dev`. Do not regenerate it with `npm install` as a bootstrap step. The image includes its own provider config with Qwen `contextWindow: 32768`, `maxTokens: 2048` and a `local-only` placeholder, not credentials. No copying from a private host Pi configuration is needed. Keep the lockfile in the source export.

Debian package sources are rewritten to HTTPS before `apt-get update`. The pinned
Node slim base has no system CA store, so the build bootstraps that store from
Node's embedded public root certificates, then installs Debian's `ca-certificates`
package alongside the tools. No host certificate files or private CA are copied;
TLS verification and Debian package-signature verification stay enabled. Build
networking must reach Debian over HTTPS as well as the npm/GitHub sources below.

### Verify the pinned native helper separately

A separate build step calls only the locked Gentle-pi `installGentleAi` export;
all other npm lifecycle scripts remain disabled. It retrieves the official Gentle AI
4.3.1 GitHub release, verifying both archive and binary SHA-256 against the locked
package's pins. Build networking must reach GitHub and its release-asset redirects,
in addition to the base-image, npm and Debian sources. Integrity pins do not replace
publisher trust. No custom manifest, PATH fallback or development binary is used.

The installer creates private root-owned files. Only its public package-local
`.gentle-ai` directories become mode 0755, the binary 0555 and manifest 0444,
allowing UID/GID 1000 to resolve and execute the verified bundle without write access.
This does not change the image's default user; the launcher supplies its runtime UID.
No host install, global Pi/fullscreen configuration, profile change, self-provisioning
or model download is part of this bootstrap or check.

Run the standalone check explicitly with the full local image ID (host Node required):

```bash
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$TEST_TAG")"
node tests/harness/native-image.integration.mjs "$IMAGE_ID"
```

The check validates its argument before effects and uses `/usr/bin/docker` with the
local Unix daemon, an empty owned Docker config/HOME under `logs/v`, and no host
mounts or credentials. It never pulls. The container is UID/GID 1000, offline,
read-only, capability-free with no-new-privileges, a 16 MiB temporary filesystem,
2 GiB memory, 2 CPUs and 128 PIDs. The Docker run is bounded to 12 seconds,
owned-container cleanup to 3 seconds, and native `version` to 3 seconds within the run.
It bypasses the entrypoint and uses the genuine installed canonical resolver before
executing `gentle-ai version`, requiring exactly 4.3.1. Owned host scratch is removed.
This proves only native integrity/nonroot version execution: it starts no SDK session,
TUI, bridge, native review, prompt or inference and does not establish full-harness readiness.
Ordinary `*.test.mjs` mock suites do not invoke it or provision Docker automatically.

### Select the image deliberately

The default remains `dr-doom-gentle:4.6.0`; the launcher does not select `$TEST_TAG`
automatically. To validate a distinct local candidate without changing that tag,
set `DOOM_LOCAL_IMAGE_ID` explicitly to its full immutable `sha256:` ID (64 lowercase
hexadecimal characters). Tags, URLs, uppercase/short IDs and an empty value are
rejected before Docker or workspace creation. The normal local launch and its
`ctf`, `pentest`, and `redteam` flows inspect/run only that ID with `--pull=never`.
External-provider launch integration is not included in this snapshot; dormant provider modules do not activate a vendor.

```bash
DOOM_LOCAL_IMAGE_ID="$IMAGE_ID" ./doom
```

A successful candidate check is not deployment. On a first installation only,
after the check succeeds and you confirm that the canonical tag does not exist,
explicitly create it:

```bash
docker image tag "$IMAGE_ID" dr-doom-gentle:4.6.0
```

If that tag already exists, stop before this command: replacing an installed image
requires a separate operator decision. Keep the existing image unchanged during
validation. The start instructions below require either your deliberately selected canonical tag or an explicit immutable `DOOM_LOCAL_IMAGE_ID`; the previously installed canonical image must not be assumed to contain this source policy.

## Start and verify deliberately

From the checkout, start `./server.sh` in one terminal, then `./doom` (or `./doom ctf`, `./doom pentest`, `./doom redteam`) in another. `server.sh` binds only `127.0.0.1:18080`, uses context 32768 and GPU layers 0. Check that the port is free first; do not replace an existing service. `doom` never builds or pulls an image implicitly.

`./doom catalogo` is offline. `curl --fail http://127.0.0.1:18080/health` checks health only. The README's inference checks are separate, explicit model requests, not installation steps or proof of full-harness acceptance. One full-harness 32K CPU model/read/final scenario was independently accepted on the explicitly selected local candidate; no-prompt TUI startup also passed. General tool/workflow reliability, interactive performance and resource suitability beyond that measured run remain unaccepted. See [workflows](doom-workflows.md) for isolation and scope limits.

### Local CPU request and cleanup policy

A freshly built image receives the fixed local CPU policy from the local launcher:
Pi HTTP idle, the container proxy upstream/request and the local relay allow 3600
seconds (proxy headers: 3620). This accommodates the observed long 32K CPU prefill;
it does not guarantee valid tool calls, interactive latency, or acceptance. Retries
remain disabled. The entrypoint applies the local Pi idle value only to its public
scratch-home settings. Bundled defaults and optional API proxy/relay/transport
remain at 1800 seconds (headers: 1820); no vendor or billing fallback is enabled.
An older installed image is not changed by updating source: validate/select the
new candidate before relying on its new policy.

Owned-container cleanup uses one 20-second deadline, including suspend on Linux.
It requests removal only for its generated name and confirms absence with a
successful exact-name listing. Removal races are not inferred from English stderr.
If absence remains unknown, stderr retains `posible contenedor huérfano` followed
by `limpieza no verificada` phase/exit/timeout diagnostics (bounded to 256 printable
stderr characters per command). This remains a failed cleanup, not successful
functional evidence; later absence does not prove removal within the deadline.
No unrelated container or Docker daemon operation is performed.

### Observed local candidate (2026-11-06)

Candidate `sha256:6141020edfffd8abc675df2ff92ff99c8a0f80f6331d04c0dc6ea099caefc651`, built with the pinned dependencies and local3600s policy described here, passed independent native/RPC/TUI component review and one actual model → `read` → authoritative final scenario. The cold CPU4/GPU0 run retained 32768/2048 and the full harness, took **45 min 57 s**, exited normally, and preserved source and owned-resource cleanup. It is functional evidence for that scenario, not an interactive SLO, every-tool validation, native-review approval or publication acceptance.

This image exists locally on the validation machine; it is not a published artifact. The old canonical image was retained unchanged. Select the tested ID explicitly using the mechanism above; other machines must build and validate their own candidate. Updating source alone does not change an existing image.

## Optional legacy host profile

Only `pi-local.sh` and `pi-harness.sh` require an existing host `pi` executable and `$HOME/.pi/agent/models.json`. [The example](../examples/pi-models.json) contains only a loopback placeholder and exactly the bundled Qwen 32768/2048 settings. If opting in, manually merge that provider into your existing host configuration without replacing other providers or credentials; never copy private configuration into this repository. No global setup is required by the recommended disposable `doom` path.

`pi-local.sh` defaults to read/grep/find/ls, disables automatic resources and is not a sandbox. The controlled legacy harness adds explicit local guidance and approval-gated execution. Neither host profile is a substitute for the complete disposable harness acceptance test.
