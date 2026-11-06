# Dr. Doom

**Experimental local CPU project.** Built on Gentle Shell/Pi, independently maintained and not an official Gentle distribution, endorsement or security certification. This source snapshot excludes the unverified eco mode and incomplete external-provider launch integration. Dormant provider modules are not an API-access or subscription promise.

Qwen3-8B abliterated Q4_K_M served locally by llama.cpp, with a disposable full Gentle harness. The default backend is CPU; no paid API is used.

**Profile: 32K full harness; no reduced harness.**

**Verified boundary (2026-11-06):** one synthetic full-harness, 32K CPU scenario completed actual model → `read` → authoritative final response and passed independent evidence review. The cold run took **45 min 57 s**: this is not accepted interactive performance, general tool reliability, CTF efficacy or release readiness. Earlier 30-minute CPU timeouts and Vulkan device loss remain historical failures, not proof of insufficient RAM. Performance remains resource-dependent. No cloud provider is activated by default.

For a clean clone, follow [installation and integrity checks](docs/install.md) first. Own source is [MIT](LICENSE); [third-party boundaries](docs/third-party.md) remain separate.

## Start

After the clean-clone installation and explicit image build, in one terminal:

```bash
cd dr-doom
export DOOM_ROOT="$PWD"
./server.sh
```

In another terminal, from the checkout:

```bash
cd dr-doom
export DOOM_ROOT="$PWD"
./doom
```

An existing canonical image is not upgraded by a source update. The independently verified **local candidate** can be selected without replacing it:

```bash
DOOM_LOCAL_IMAGE_ID=sha256:6141020edfffd8abc675df2ff92ff99c8a0f80f6331d04c0dc6ea099caefc651 ./doom
```

That ID belongs to the machine used for validation, not a published image. On another machine, build and check your own candidate as described in [image selection](docs/install.md#select-the-image-deliberately). Native review approval and canonical-image promotion are not established.

`doom` uses the complete disposable harness. For the optional legacy read-only host profile, run `"$DOOM_ROOT/pi-local.sh"` instead. That profile exposes read, grep, find and ls only; it disables automatic extensions, MCP, skills, context files and project configuration. It is **not** the controlled harness and does not inherit project instructions. Supply applicable scope and constraints in your prompt.

Example prompt:

> Review these local scan results. Separate verified evidence from hypotheses and list manual checks. Do not contact any target or execute a PoC.

Stop the server with Ctrl+C. No service or startup task is installed. The optional legacy host profile requires an existing Pi installation and an explicit local provider configuration; see [installation](docs/install.md#optional-legacy-host-profile). The disposable `doom` profile needs neither host-global provider setup nor a host Pi installation.

## Configuration

| Setting | Value |
| --- | --- |
| Model | Qwen3-8B abliterated, Q4_K_M (~5.03 GB) |
| Server | llama.cpp v0.7.0, CPU baseline |
| Endpoint | http://127.0.0.1:18080/v1 |
| Context / generation | 32768 / 2048 tokens |
| Threads / simultaneous requests | 4 / 1 |
| Pi provider/model | local-redteam / qwen3-8b-redteam |
| Disposable Pi configuration | bundled `harness/disposable/config/models.json` |
| Optional legacy host configuration | `$HOME/.pi/agent/models.json` |

`pi-local.sh` overrides `PI_CODING_AGENT_DIR` for its child process only. It does not change your default provider, shell configuration or credentials. The local placeholder API key is not an authentication control; loopback is the network boundary.

If you deliberately need command execution for an authorized lab, opt in explicitly:

```bash
"$DOOM_ROOT/pi-local.sh" --tools read,grep,find,ls,bash
```

Pi tools run with your user permissions. Use an isolated lab for untrusted code; the launcher is not a sandbox. Do not expose this server to the LAN.

## Disposable Gentle harness

`doom` loads the full Gentle Shell harness in a separate disposable container; `pi-harness.sh` remains the older controlled host profile.

The verified read/final scenario does not validate every tool or CTF/pentest/red-team workflow. `./doom catalogo` works offline without Docker or a model; mock/static checks alone cannot establish inference, normal TUI output or usable latency. No-prompt native/RPC/TUI component checks are narrower than the actual model scenario. Do not reduce context, tools or the harness to claim equivalent acceptance.

```bash
./server.sh
# Build/check a fresh candidate following docs/install.md; do not replace an installed tag.
# Select its full local SHA-256 ID with DOOM_LOCAL_IMAGE_ID before launching.
./doom              # all slash flows available
./doom ctf           # or pentest, redteam
```

The image build is explicit: `doom --help` and launch never pull or build it. It needs the existing loopback model server, but the container has no external network. The launcher does **not** mount your current directory; its only writable project location is `harness/doom-workspace/`. It does not install anything globally. To invoke it by name in the current shell only, opt in explicitly:

```bash
export PATH="$DOOM_ROOT:$PATH"
doom
```

See [Dr. Doom workflows](docs/doom-workflows.md) and the [offline provider catalog](docs/free-llm-catalog.md). The disposable launcher explicitly loads official Gentle core, agents and shell extensions, their selected skills, local CTF/pentest/red-team skills and slash prompts, plus the project-local **Dr. Doom** dark-green, graphite, and metallic theme and compact TUI header. It applies these only to that invocation (`--theme` and `--use-theme`); it does not save a Pi theme setting. Noninteractive, JSON, and RPC sessions receive no custom header or visual output.

The following applies only to the legacy `pi-harness.sh` host profile. It loads only `harness/extension.js`, the TUI-only `harness/ui.js`, its explicit scoped-redteam skill, and explicit system guidance. Automatic project resources, MCP, and global extensions remain disabled. `harness/mcp.disabled.json` is a disabled template, not an enabled MCP integration: no trusted read-only MCP surface was identified or verified.

Legacy host-profile read-only tools (`read`, `grep`, `find`, `ls`) remain available. Host `bash` is fail-closed without an interactive UI. With a UI, it accepts exactly `target`, `scope`, and a harness-issued local-lab receipt ID, verifies that the receipt's bounded workspace artifact is unchanged, then confirms the exact native command and Pi cwd. Receipts expire after five minutes and one successful confirmation consumes them; a decline or failed check preserves a valid receipt, while expiry or replay blocks execution. A missing field, stale artifact, or arbitrary evidence also blocks execution. This is an approval record, not a remote-scope grant.

`lab_exec` is the only automatic execution path. It accepts an argv array and a **locally present** `name@sha256:<digest>` image only, validates real paths under `harness/lab-workspace/`, and invokes Docker without shell interpolation. It uses an explicit local Unix Docker endpoint with sanitized Docker environment, `--network=none`, non-root UID, no-new-privileges, dropped capabilities, read-only root filesystem, `/tmp` tmpfs, CPU/RAM/PID limits, output truncation, a timeout, and `--rm` cleanup. Timeouts and run errors also force-remove only the generated harness container identity; a failed cleanup reports the possible orphan identity. It never pulls/builds images, mounts sockets/secrets, uses existing assessment containers, or permits privileged/device/host-network options. An unavailable image reports the next decision—explicitly approve installation or stop—without downloading it.

A zero lab exit proves command execution only. It does not prove exploit efficacy, vulnerability, authorization, or a valid vulnerable/patched control. Never use this Docker boundary for kernel or privileged PoCs; use a separately approved disposable VM. Remote actions, scans, downloads, and image installation always need separate human approval.

## Optional manual model checks

The following commands make real model requests. They are not installation steps or ordinary offline regression tests. Authorize resources/time and target only an owned backend before using them; CPU4 inference can create sustained load and heating, with no thermal-control guarantee in this release.

```bash
curl --fail http://127.0.0.1:18080/health
python smoke.py
./pi-local.sh --no-session --no-tools -p 'Reply with exactly LOCAL_OK'
```

`smoke.py` checks model identity, text inference and a synthetic tool call. It does not execute the returned function or send traffic to assessment targets. Test outputs and performance observations belong in `logs/`.

The GGUF revision, exact byte count and published SHA-256 are in `model-lock.json`. The checksum verifies download integrity, not model quality or publisher trust. Model files, runtime sources and logs are ignored by Git.

## Limitations

“Uncensored”/“abliterated” is a publisher claim, not a guarantee of accuracy, no refusals or reliable tool use. An 8B model can invent CVEs, versions and exploitability. Confirm findings against evidence and primary advisories; measure memory and latency before relying on the 32K server. An older host profile advertising 8192 would underuse it; the bundled disposable profile and optional example both declare 32768.

Only use explicitly authorized local labs. Private assessment evidence is not a smoke-test fixture, and documentation is not authorization to contact third-party targets.
