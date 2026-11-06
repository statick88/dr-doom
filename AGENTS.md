# Dr. Doom — public contribution guide

Read `README.md`, `docs/install.md` and `docs/third-party.md` before changing this experimental local CPU project. It is an independent community project built on Gentle Shell/Pi, not an official distribution or security certification.

## Source boundaries

- `doom` and `harness/disposable/` launch the full disposable harness. Keep loopback-only model transport, offline/nonroot containers, resource limits, no host credentials/home/Docker socket mounts and no implicit pull/build.
- `server.sh` retains Qwen3-8B Q4_K_M, CPU4/GPU0, context32768, output2048 and parallel1. Do not lower context/tools or activate GPU/cloud to claim equivalent acceptance.
- `harness/providers/` contains dormant protocol foundations, not an accepted external-provider launcher. Never use real credentials in tests.
- `integrations/omarchy-dr-doom/` is optional source; tests do not authorize changing an installed desktop.
- No model weights, runtime builds, credentials, private assessment data, operational logs or private development history belong in Git.

## Offline checks

Use Node>=22.19 and Python3. There is no root npm project or automatic installer.

```sh
node --loader ./tests/harness/mock-loader.mjs --test --test-concurrency=1 \
  tests/harness/*.test.mjs integrations/omarchy-dr-doom/tests/model.test.cjs
bash -n doom server.sh pi-local.sh pi-harness.sh harness/disposable/entrypoint.sh
./doom --help
./doom catalogo --help
git diff --check
```

Use an owned short TMPDIR for Unix-socket fixtures and serialize CPU-limited checks when supported by the host. Do not read secrets, use private data as fixtures, install dependencies globally, or start Docker/model/SDK/TUI/live-network probes as part of ordinary offline tests. `native-image.integration.mjs`, model requests, image builds and desktop tests are separately opted in.

## Evidence

One synthetic full-harness CPU model/read/final scenario completed in45min57s. This is not interactive performance, general tool/CTF reliability, thermal acceptance or native-review approval. Keep tests/docs with behavior changes, preserve third-party notices, and distinguish source checks from actual model evidence. New images need their own applicable validation; never replace an installed image silently.
