# Validator trust contract (design only)

This contract defines a future decision boundary for validator identity, actor trust, and evidence-before-confirmation. It is a design aid for future validator work, not an authentication scheme, attestation system, runtime guard, ledger writer, API, or vulnerability-confirmation mechanism.

## Decision in brief
A future confirmation must be rejected unless an authorized validator, independently defined evidence, provenance review, and conflict review all pass. A declared actor label, reviewer label, hash match, ledger flag, or synthetic fixture never authenticates a person, proves authorization, or confirms a vulnerability.

## Scope and non-goals
| In scope | Explicitly out of scope |
| --- | --- |
| A future review vocabulary and decision sequence | Implementing identity, authentication, authorization, signing, or attestation |
| Synthetic adversarial examples and rejection outcomes | Writing or changing an evidence ledger, case, artifact, or review result |
| Ownership, conflict, escalation, and implementation gaps | Network, target, MCP, attack, model, or runtime behavior |

## Current boundary
The public experimental snapshot does not ship an independent evidence validator, authenticated actor registry, or vulnerability-confirmation mechanism. These two design documents introduce none of those capabilities and do not add a ledger or ARTEX import CLI.

Existing local isolation and legacy exact-action approvals have separate purposes: local execution controls and approval receipts are not authenticated evidence review or remote target authorization. Any future ledger or import integration must keep incoming labels and claims untrusted until its separately scoped evidence gates are actually implemented and checked.

## Terms
| Term | Meaning in this contract | Does not mean |
| --- | --- | --- |
| Declared actor | A supplied string claiming a role or identity | An authenticated person, organization, or authority |
| Authenticated actor | A future identity assertion verified by an explicitly selected mechanism and policy | Mere possession of a label, hash, fixture, or reviewer field |
| Evidence item | A bounded record offered for review, with provenance and integrity information | Proof that its claim is true or in scope |
| Independent evidence | Evidence collected or reproduced through a separately defined path with no unapproved common actor, source, or control point | A second copy, hash, label, or derived summary of the same source |
| Confirmation | A future narrow disposition that all gates below have passed | An exploit finding, target authorization, or general acceptance |
| Validator | The future role accountable for applying the confirmation gate and recording its disposition | An automatic ledger status or a reviewer label |

## Future confirmation gate
A future implementation may offer confirmation only in this order. A missing, ambiguous, stale, corrupt, conflicting, or out-of-scope input stops at rejection or escalation; it must not silently downgrade into confirmation.

| Gate | Future validator must establish | Reject when | Escalate when |
| --- | --- | --- | --- |
| 1. Claim boundary | Claim, authorized scope, time window, and decision owner are explicit | Scope or authority is absent, mismatched, or expired | Scope interpretation needs the designated authority |
| 2. Actor assurance | Each required role has a policy-approved authenticated identity assertion | A role is only declared, mismatched, revoked, or unverifiable | Identity mechanism or policy is unavailable or disputed |
| 3. Evidence provenance | Each item has a defined origin, acquisition route, custody record, and integrity check | Origin, custody, digest, or integrity check fails | Provenance is incomplete but may be resolved without altering evidence |
| 4. Independence | Required evidence paths meet the predeclared independence rule | Evidence is self-derived, shares a disallowed source/control point, or is circular | Common dependencies need an explicit independence ruling |
| 5. Conflict and freshness | Validator has checked conflicts, self-review, incompatible findings, and freshness | Validator/reviewer conflict exists, or evidence is stale under the future policy | Material conflict or freshness threshold needs owner adjudication |
| 6. Decision record | Authorized validator records a bounded decision and reasons without rewriting evidence | Required gate outcome is absent or the record would overclaim | Rejection evidence needs retention or governance handling |

A future gate is conjunctive: passing a later gate cannot cure a failed earlier gate. The future policy must define its identity mechanism, authorization source, independence criteria, freshness duration, custody fields, retention, and appeal route before any runtime integration.

## Ownership and conflict model
| Role | Future responsibility | Must not do |
| --- | --- | --- |
| Submitter | Declare the claim and supply bounded candidate evidence | Authenticate itself through a label or decide its own confirmation |
| Evidence custodian | Preserve the offered item and provenance record under the future policy | Repair, replace, or rewrite a failed item to make it pass |
| Reviewer | Assess relevance, provenance, and independence against the future gate | Review its own submission or substitute a label comparison for independence |
| Validator | Apply every gate and issue reject, escalate, or narrow confirm disposition | Treat a ledger status, hashes, or fixtures as authority |
| Scope/authorization owner | Resolve scope or authority escalations | Delegate target authorization implicitly through a review result |
| Governance owner | Resolve identity-policy, conflict, retention, or appeal escalations | Convert unresolved disputes into confirmation |

A single human or system may not occupy conflicting roles unless a future policy explicitly permits it and defines compensating independent oversight. At minimum, submitter and reviewer/validator separation must be demonstrable through future authenticated identities, not distinct free-text labels.

## Dispositions

| Disposition | Meaning | Permitted next action |
| --- | --- | --- |
| `reject` | A required gate failed or supplied material is invalid | Retain the original material according to future policy; do not confirm or rewrite it |
| `escalate` | A decision needs the designated owner or missing policy | Stop confirmation and request the named authority's decision |
| `unreviewed` | Material exists but has not completed this future gate | Do not imply support, authentication, independence, or confirmation |
| `confirm` | Reserved for a future implementation after all gates and authority are independently evidenced | Record only the bounded claim; it still does not grant target authorization or prove general exploit validity |

## Synthetic fixtures

The fixtures below are documentation examples only. Every identifier, digest, actor, and claim is invented. Any fixture policy is illustrative, not an adopted runtime rule or freshness threshold. Each expected disposition describes a future policy decision; actual runtime effects are `NONE`.

### F1 — declared/authenticated actor mismatch

```json
{
  "fixture": "F1-declared-authenticated-mismatch",
  "declared_actor": "validator-iris",
  "authenticated_actor": "validator-nora",
  "evidence": [{"id": "synthetic-e1", "origin": "synthetic-lab-a", "digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],
  "expected_disposition": "reject",
  "reason": "The required validator identity does not match the asserted identity.",
  "actual_runtime_effects": "NONE"
}
```

### F2 — self-review despite different labels

```json
{
  "fixture": "F2-self-review",
  "submitter": {"declared": "analyst-a", "authenticated_subject": "subject-17"},
  "reviewer": {"declared": "reviewer-b", "authenticated_subject": "subject-17"},
  "expected_disposition": "reject",
  "reason": "Distinct labels conceal one authenticated subject; independent review is absent.",
  "actual_runtime_effects": "NONE"
}
```

### F3 — stale and conflicting evidence

```json
{
  "fixture": "F3-stale-conflicting-evidence",
  "fixture_policy_only": {"evaluated_at": "2026-11-16T00:00:00Z", "freshness_window_days": 30, "material_conflict_action": "escalate"},
  "claim_scope": "synthetic-service/v1",
  "evidence": [
    {"id": "synthetic-e2", "collected_at": "2020-01-01T00:00:00Z", "result": "supports"},
    {"id": "synthetic-e3", "collected_at": "2026-01-01T00:00:00Z", "result": "contradicts"}
  ],
  "expected_disposition": "escalate",
  "reason": "Freshness has failed and a material conflict requires the designated owner.",
  "actual_runtime_effects": "NONE"
}
```

### F4 — corrupt digest or custody failure

```json
{
  "fixture": "F4-corrupt-digest",
  "evidence": {"id": "synthetic-e4", "recorded_digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "recomputed_digest": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},
  "expected_disposition": "reject",
  "reason": "Integrity or custody verification failed; the item cannot satisfy provenance.",
  "actual_runtime_effects": "NONE"
}
```

### F5 — out-of-scope evidence

```json
{
  "fixture": "F5-out-of-scope",
  "authorized_scope": "synthetic-app/endpoint-a",
  "evidence_scope": "synthetic-app/endpoint-b",
  "expected_disposition": "reject",
  "reason": "Evidence does not match the bounded authorized claim scope.",
  "actual_runtime_effects": "NONE"
}
```

### F6 — normal synthetic illustration

```json
{
  "fixture": "F6-normal-illustration",
  "authenticated_roles": {"submitter": "subject-21", "reviewer": "subject-34", "validator": "subject-55"},
  "evidence_paths": ["synthetic-lab-a/reproduction", "synthetic-lab-b/independent-observation"],
  "provenance_and_freshness": "future-policy-defined and passing",
  "expected_disposition": "confirm",
  "reason": "Illustrates the future preconditions only; no real identity, authorization, or vulnerability is established.",
  "actual_runtime_effects": "NONE"
}
```

F6 is not executable acceptance criteria. It does not make its synthetic identities, evidence paths, or outcome real, and it does not prove the future independence rule is adequate.

## Future implementation gap map

| Gap | Required future design decision | Bounded future fixture or documentation work | Not authorized by this contract |
| --- | --- | --- | --- |
| Identity assurance | Choose a policy-owned authentication mechanism, lifecycle, revocation, and verification failure behavior | Synthetic identity-match, mismatch, revoked, and unavailable-mechanism cases | Authentication or attestation implementation |
| Authority and scope | Define who grants scope, expiry, delegation, and appeal | Synthetic absent, expired, delegated, and conflicting-scope cases | Target authorization or remote action |
| Evidence provenance | Define custody, integrity, source classes, and retention without evidence rewriting | Synthetic missing custody, digest mismatch, duplicate source, and retention cases | Ledger migration, mutation, or external storage |
| Independence | Define prohibited common control points and the required independent paths | Synthetic shared-operator, shared-source, circular-derivation, and two-path cases | Automatic independence scoring or confirmation |
| Conflicts and review | Define role separation, disclosure, recusal, and escalation ownership | Synthetic self-review, label alias, undisclosed conflict, and recusal cases | Reviewer/validator runtime workflow |
| Decision record | Define a minimal bounded decision record and audit/readback requirements | Synthetic reject, escalate, unreviewed, and narrow-confirm examples | A fixed public schema, API, or persistence format |

## Review checklist

- [ ] The document keeps declared labels, hashes, and current review states distinct from authenticated authority.
- [ ] Every future confirmation path requires independent evidence gates before confirmation.
- [ ] Every adversarial fixture has an expected disposition and `actual_runtime_effects: NONE`.
- [ ] The normal illustration is visibly synthetic and does not claim current capability.
- [ ] No runtime behavior, ledger mutation, identity system, target interaction, or security-control implementation is introduced.

## Sources and limits

- `README.md`, **Disposable Gentle harness** and **Limitations** — current isolation/approval boundaries and the absence of general vulnerability validation or target authorization.
- `docs/doom-workflows.md`, **Límite de seguridad** — workflow guidance does not grant target access or establish tool efficacy.
- `docs/experimental-status.md` — the narrow public source snapshot and its unaccepted capabilities.
- `docs/third-party.md` — original documentation and separate upstream licensing/attribution boundaries.

This contract is passive documentation. It changes no runtime behavior and establishes no security property, enforcement, authorization, authentication, attestation, independent validation, or vulnerability confirmation.
