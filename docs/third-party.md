# Source licensing boundaries

The root [MIT license](../LICENSE) covers original Dr. Doom source and documentation only. It does not relicense any model, dependency, upstream work or separately licensed component.

| Component | Boundary |
| --- | --- |
| Qwen GGUF | `model-lock.json` records the publisher's `apache-2.0` declaration for the pinned artifact. This is not an independent verification of the model's full licensing chain or a new grant of rights. Review the pinned repository's notices before use or redistribution. |
| llama.cpp | Retrieved separately from the pinned upstream source archive; its own license/notices apply. Preserve them when building or redistributing. |
| Pi / Gentle / npm packages | Resolved by `harness/disposable/package-lock.json`; package licenses and notices remain authoritative. Root MIT does not replace them. |
| Offline provider catalog | Preserve `harness/catalog/LICENSE.upstream` and the provenance recorded with the snapshot. Descriptive provider entries grant no service access or model rights. |
| Omarchy plugin | Preserve the license and notices bundled under `integrations/omarchy-dr-doom/`; a separate repository or installed-copy acceptance is not implied. Root MIT does not replace that license. |
| Container base and system packages | Dockerfile references are not relicensing grants; their upstream distribution terms apply. |

The source publication does not vendor model binaries, runtime source archives/builds, container images or installed dependencies. Manifests, lockfiles and reproducible retrieval instructions are included instead. Generated logs, credentials and private operational history are not application source and are excluded from the public source export.

The local methodology skills/prompts are original adaptations of general security-testing practices, not copies of ambiguously licensed upstream methodology text. External references and provider catalogs do not authorize copying their content or contacting targets. Preserve upstream notices already present; do not infer new license rights from this document.
