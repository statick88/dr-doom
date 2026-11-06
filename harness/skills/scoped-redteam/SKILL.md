---
name: scoped-redteam
description: "Trigger: controlled red-team assessment, local lab validation, exploit triage. Enforces scoped evidence and stop rules."
license: MIT
metadata:
  author: local-llm
  version: "1.0"
---

# Scoped red-team workflow

1. State the authorized target, exact action, scope boundary, and evidence before requesting host execution. Never infer these from a command string.
2. Prefer static review and local vulnerable/patched controls. Record command, image digest, inputs, output, and limits as provenance. Use only a harness-issued receipt whose bound workspace artifact still verifies: it expires after five minutes and is consumed by one successful host approval.
3. Use `lab_exec` only for an existing digest-pinned image and dedicated lab workspace. It has no network and exit zero proves only that a command ran, never exploit efficacy.
4. Stop for privilege escalation, kernel/privileged PoCs, host devices, secrets, sockets, downloads, image builds/pulls, or any remote operation. These need separate human decisions; kernel work needs a disposable VM.
5. Treat findings as hypotheses until independently validated. Keep exploit claims separate from execution evidence and stop on out-of-scope impact.
6. For the compact ROE, evidence, and reporting checklists, read `methodology.md` relative to this skill directory. It is on-demand behavioral guidance; existing harness policy remains the enforcement layer.
