# Methodology workflow contract

This design contract makes the existing CTF, pentest, and red-team guidance reviewable without treating it as authorization or runtime enforcement. It gives an operator and a reviewer a common way to record evidence, stop safely, and escalate decisions; it adds no target access, tool, network, MCP, or execution capability.

## Public snapshot boundary

This public contract describes guidance and future evidence decisions, not a complete methodology guard. The experimental snapshot does not ship an independent validator or the unaccepted external-provider launcher. Provider modules remain dormant foundations; this documentation does not activate them.

## Quick path

1. Classify the work as a bounded, authorized local exercise, or stop before collecting or acting on evidence.
2. Record inputs and evidence at each stage; use the stage owner to decide whether to continue, stop, or escalate.
3. Treat every guidance label and fixture below as illustrative. Only existing runtime controls apply, and none grants target authorization.

## Contract boundaries

| Topic | Contract decision |
| --- | --- |
| Workflows | The same evidence lifecycle applies to CTF, pentest, and red-team guidance; workflow labels do not broaden scope. |
| Evidence | A claim is a recorded observation with origin and limits, not a vulnerability confirmation, authorization, or exploit result. |
| Ownership | The operator records observations; the scope authority supplies authorization; the evidence reviewer decides whether a claim is sufficiently supported. These are distinct roles and may require human escalation. |
| Stop rule | Missing scope, contradictory evidence, an explicit stop, or a requested external action stops the current stage. No fixture creates an exception. |
| Design status | This document is a proposal for future documentation/fixture work. It is not a fixed API, schema, CLI, or public storage contract. |

## Workflow stages

| Stage | Inputs | Required evidence to record | Output | Owner | Stop / escalation |
| --- | --- | --- | --- | --- | --- |
| 0. Intake | Stated purpose, workflow label, declared scope | Purpose, authorized local boundary if supplied, excluded actions | A bounded question or a stop record | Scope authority | Stop if authorization or boundary is absent; escalate to the scope authority rather than infer it. |
| 1. Plan | Bounded question and known limits | Assumptions, planned observation type, stop conditions, evidence location policy | Reviewable observation plan | Operator | Stop if the plan needs target contact, credentials, downloads, or unapproved execution. |
| 2. Observe | Plan and permitted local inputs | Timestamp/context, source class, exact observation, uncertainty, preservation location | Raw observation record | Operator | Stop on unavailable input, scope drift, or any request to act beyond the plan. |
| 3. Corroborate | One or more observations | Agreement/conflict analysis, independent source class where required, unresolved alternatives | Supported, conflicting, or insufficient-evidence finding | Evidence reviewer | Escalate conflicts; do not select a preferred conclusion merely to continue. |
| 4. Decide | Corroboration result and limits | Decision, rationale, residual uncertainty, next permitted action or explicit stop | Bounded disposition | Scope authority and evidence reviewer | Stop if evidence cannot support the requested conclusion; separate any new action into a new authorization decision. |
| 5. Preserve | Disposition and allowed records | What was retained, who owns it, integrity/retention limits, non-claims | Review-ready record or explicit no-record outcome | Record owner | Stop if preservation would ingest private history, credentials, or data outside the stated boundary. |

A normal progression is not permission to skip a stage. For example, a documented observation can remain insufficient at stage 3, and a supported finding can still be ineligible for stage 4 action without a separate scope decision.

## Evidence handling rules

| Rule | Required behavior | Not established by this contract |
| --- | --- | --- |
| Traceability | Associate an observation with its source class, context, limits, and owner. | Source authenticity, target authorization, or vulnerability truth. |
| Independence | State why a corroborating observation is independent, or label it as non-independent. | That two labels, hashes, or reviewer names are independent evidence. |
| Conflict | Preserve material disagreement and competing explanations. | A resolution merely because one source is more convenient. |
| Confirmation | Use the term only when the separately defined evidence gate is met. | Confirmation from a hash, guidance text, model output, or declared reviewer label alone. |
| Stop | Record the trigger and the incomplete state; do not convert a stop into a negative conclusion. | Permission to retry, change tools/context, or contact a target. |

## Guidance versus enforcement

The existing guidance describes a method, while current controls enforce only specific local boundaries. Reviewers must name the actual control instead of attributing enforcement to a prompt or workflow label.

| Area | Existing guidance or design intent | Existing mechanical control cited | Unmet enforcement / truthful limit |
| --- | --- | --- | --- |
| Disposable local flow | CTF, pentest, and red-team prompts retain scope, evidence, and stop rules. | `harness/disposable/runtime.py` builds the local container with `--network=none`, read-only root, dropped capabilities, resource limits, and a confined workspace. | Container isolation does not authorize any target or validate a finding; it is not a complete methodology guard. |
| Local model relay | The disposable container reaches the fixed loopback model path only. | `harness/disposable/runtime.py` relays to fixed `127.0.0.1:18080`; `docs/doom-workflows.md` states the socket does not permit arbitrary destinations or ports. | A local model response alone is not independent confirmation, authorization, or a tool-use guarantee. |
| Legacy host profile | Host shell use requires an interactive, exact-action approval route. | `harness/policy.js` denies MCP actions, limits tools, and binds host approval to a fresh local receipt, target, scope, and exact approval. | This is a local approval record, not a remote-scope grant; it is distinct from the disposable flow. |
| Restricted local lab | A locally present, digest-pinned image may run a bounded argv in a dedicated workspace. | `harness/policy.js` validates the image/workspace and applies network-none, non-root, read-only, resource, timeout, and cleanup controls. | A zero exit proves execution only, not authorization, exploit efficacy, or vulnerability status. |
| Dormant provider foundations | This public snapshot excludes the unaccepted external-provider launcher; provider modules are not a usable or validated cloud mode. | `harness/providers/profiles.py` defines closed provider/region selections and fixed endpoints; `harness/providers/relay.py` implements the separate host-side relay lifecycle. | No vendor is activated or live-provider behavior accepted; these source foundations do not establish entitlement, billing, or scope approval. |

## Synthetic fixtures

These static examples are inspection aids, not inputs to a current program. Their labels are not actual authorization; each has unchanged effects: no target access, network activity, command execution, guard change, record creation, or runtime behavior.

### Normal local observation

```json
{
  "fixture": "normal-local-observation",
  "workflow": "ctf",
  "scope": "illustrative local exercise only",
  "stage": "observe",
  "observation": {"source_class": "provided-local-text", "claim": "A configuration value is present", "limits": "No external validation performed"},
  "decision": "continue-to-corroboration",
  "actual_runtime_effects": "NONE",
  "unchanged_effects": ["no target contact", "no execution", "no authorization granted"]
}
```

### Missing evidence

```json
{
  "fixture": "missing-evidence",
  "workflow": "pentest",
  "stage": "corroborate",
  "observation": {"source_class": "assertion-only", "claim": "A flaw exists", "limits": "No independent observation"},
  "decision": "stop-insufficient-evidence",
  "actual_runtime_effects": "NONE",
  "escalate_to": "evidence reviewer",
  "unchanged_effects": ["no retry implied", "no target contact", "no confirmation"]
}
```

### Conflicting evidence

```json
{
  "fixture": "conflicting-evidence",
  "workflow": "redteam",
  "stage": "corroborate",
  "observations": [
    {"source_class": "local-note", "claim": "condition-present"},
    {"source_class": "independent-local-record", "claim": "condition-absent"}
  ],
  "decision": "stop-preserve-conflict",
  "actual_runtime_effects": "NONE",
  "escalate_to": "scope authority and evidence reviewer",
  "unchanged_effects": ["no preferred conclusion", "no execution", "no target access"]
}
```

### Explicit stop

```json
{
  "fixture": "explicit-stop",
  "workflow": "ctf",
  "stage": "plan",
  "stop_trigger": "scope authority requested no further action",
  "decision": "stop-recorded",
  "actual_runtime_effects": "NONE",
  "next_action": "await-separate-human-decision",
  "unchanged_effects": ["no automatic reopening", "no guard bypass", "no network activity"]
}
```

## Bounded implementation-gap map

| Gap | Bounded follow-up | Evidence needed before calling it complete | Out of scope |
| --- | --- | --- | --- |
| Workflow guidance has no shared review matrix | Maintain this design matrix and synthetic examples as a documentation aid. | Human review that stages, owners, stops, and limits are understandable. | Runtime parsing, new CLI flags, or automatic flow enforcement. |
| Guidance does not mechanically establish target scope | Document which existing control applies to disposable versus legacy-host work. | Source readback against the cited runtime/policy files. | Target authorization guard, target registry, or target execution. |
| Evidence labels can be mistaken for confirmation | Coordinate a separate validator-trust design that defines evidence gates and actor trust. | Review of the separate design only. | Validator implementation, identity service, private-history ingestion, or confirmation claims. |
| Current controls are distributed across local and optional paths | Keep isolation, legacy approvals, and provider relay as separate entries in documentation. | Citation check that each claim names the relevant source. | Unifying runtimes, changing relay behavior, or enabling cloud providers. |
| Stop records are conceptual rather than a shared durable format | Decide later whether a bounded documentation template is useful. | Explicit future scope decision and privacy review. | New database, evidence ledger changes, cross-project records, or retention migration. |

## Review checklist

- [ ] Each claimed observation has a source class, limit, and owner.
- [ ] Each continuation has a stated stop condition and escalation owner.
- [ ] Disposable isolation, legacy host approval, and optional provider relay are not conflated.
- [ ] A workflow label is not presented as target authorization or mechanical enforcement.
- [ ] Fixtures retain their stated unchanged effects and are described as static examples.

## Source citations and limits

- `README.md`, **Disposable Gentle harness** and **Limitations**: distinguishes the disposable harness, disabled MCP, and the fact that documentation is not authorization.
- `docs/doom-workflows.md`, **Comandos disponibles** and **Límite de seguridad**: records flow guidance and disposable network/local-model limits.
- `harness/disposable/runtime.py`, `build_docker_argv`, `Relay`, and `main`: source of the disposable container, confined workspace, fixed loopback relay, and cleanup descriptions.
- `harness/policy.js`, `decideToolCall`, `validateHostApproval`, and `runRestrictedLab`: source of legacy-profile tool decisions, local receipts, restricted lab validation, and cleanup behavior.
- `harness/providers/profiles.py`, `get_profile` and `resolve_api_key`, and `harness/providers/relay.py`, `ProviderRelay`: tracked source references for closed provider/region choices and the separate host relay boundary; not live-provider verification.
- `docs/methodology-audit.md`, **Adaptation boundary**: states that local methodology guidance is original and does not add authorization, target traffic, or execution chains.

Static inspection of these sources cannot prove runtime behavior, guard completeness, authorization, target safety, tool reliability, provider behavior, or vulnerability validity. This contract deliberately leaves those claims unmet.
