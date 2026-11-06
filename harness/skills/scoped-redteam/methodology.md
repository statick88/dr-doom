# Assessment methodology

Use this as an on-demand workflow aid. It is behavioral guidance, not an authorization grant, enforcement mechanism, durable record, multi-agent process, or pentest validator. Existing harness policy remains the mechanical control.

## Rules of engagement

- Start with offline evidence review. Before any host action, state the authorization, target, exact action, and scope boundary; obtain the separate required approval.
- Do not infer permission from a command, prior evidence, or a finding. No automated chains, scanners, history synchronization, or implicit authorization.
- Prefer a local vulnerable/patched control when available. Record its limits: it can support a hypothesis but does not establish target relevance, exploitability, or permission.

## Evidence workflow

- Label claims as **candidate**, **confirmed**, or **rejected**. Keep hypotheses separate from observed evidence.
- A candidate becomes confirmed only after independent validation. A successful command or local control alone is not confirmation.
- Preserve useful provenance: inputs, commands, environment, observed output, and limitations. Do not claim what the evidence does not show.

## Report checklist

- State authorization and scope separately from technical evidence and approval status.
- For each finding, give its status, evidence, validation method, impact boundary, limitations, and next decision.
- Stop and ask for a new decision when the work reaches a scope boundary or requires a prohibited action.

For the always-loaded behavioral summary, see `../../system-guidance.md` (resolve this path relative to this skill directory). For source currency and adaptation boundaries, see `../../../docs/methodology-audit.md` (also relative to this skill directory).
