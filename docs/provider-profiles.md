# Offline cloud API profiles

This foundation selects public API metadata only. **Cloud providers are not yet
usable in Doom through this module.** It does not start a relay, change the local
Qwen default, resolve credentials from files, log in, or contact a vendor.

## Quick path

From the repository root (use `-B` to avoid Python bytecode files):

```sh
python3 -B -m harness.providers.profiles list
python3 -B -m harness.providers.profiles describe --provider openai --model YOUR_MODEL_ID
python3 -B -m harness.providers.profiles describe --provider qwen --model YOUR_MODEL_ID --region intl
```

`list` returns the stable JSON array `openai`, `anthropic`, `gemini`, `qwen`.
`describe` returns one JSON object containing `provider`, `model`, `region`, `api`,
`upstream`, `keyEnv`, `billing`, and `sdk`. Neither command reads keys or creates
files. Standard CLI parsing may consult locale/terminal environment variables;
that is separate from credential resolution. Invalid arguments exit 2 with empty stdout and exactly
`Invalid profile arguments.` plus newline on stderr, without echoing inputs.

## Host-only integration contract

Import `APIProfile`, `get_profile`, `resolve_api_key`, `sdk_descriptor`, and
`describe_profile` from `harness.providers.profiles`.

1. Call `get_profile(provider, model, region=None)` (region is keyword-only).
   The frozen profile stores only the selection; `api`, `upstream`, and `key_env`
   are derived read-only properties. Direct `APIProfile` construction validates too.
2. A future **host** caller may call `resolve_api_key(profile, environ)` with its
   own mapping. Only the selected environment name is read. The returned string
   must stay in caller host memory, never in container configuration or logs.
3. `sdk_descriptor(profile)` returns fresh `models.json`-shaped data using only
   `doom-relay-placeholder`, never the actual key. `describe_profile` adds public
   metadata. Neither function resolves keys or mutates the profile/mapping.

| API selection | Protocol | Selected host variable | Fixed upstream |
|---|---|---|---|
| openai | openai-responses | OPENAI_API_KEY | https://api.openai.com/v1 |
| anthropic | anthropic-messages | ANTHROPIC_API_KEY | https://api.anthropic.com |
| gemini | google-generative-ai | GEMINI_API_KEY | https://generativelanguage.googleapis.com/v1beta |
| qwen, cn | openai-completions | DASHSCOPE_API_KEY | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| qwen, intl | openai-completions | DASHSCOPE_API_KEY | https://dashscope-intl.aliyuncs.com/compatible-mode/v1 |

Qwen requires explicit `cn` or `intl`; other providers reject any region.
Regional keys/endpoints are not interchangeable ([ModelStudio source](https://www.alibabacloud.com/help/en/model-studio/base-url)).
There are no custom URLs, proxy overrides, credential-storage fields or fallback.
Model IDs are explicit bare native IDs, not a catalog/entitlement assertion:
ASCII letters/digits initially, then letters/digits/dots/underscores/hyphens;
OpenAI also allows colons for fine-tuned IDs. Maximum 256 characters; `..`,
slashes, URLs, controls, query strings and fragments are rejected.
Keys must be nonempty printable strings without whitespace; known Claude Code
`sk-ant-oat...` OAuth tokens are rejected in API mode for every selection.
API errors are constant `ValueError` messages: `Invalid provider.`,
`Invalid region.`, `Invalid model identifier.`, or `Invalid API key.`

## Descriptor boundary and remaining work

Descriptors use container loopback `http://127.0.0.1:18080`: `/v1` for OpenAI/Qwen,
`/` for Anthropic, `/v1beta` for Gemini. Pi's native Google transport sets SDK
`apiVersion` empty for this custom base URL; do not append another version.
Native protocols, tool conversion and signatures remain in the SDK; a future
relay must transport them opaquely. Configured context/output remain 32768/2048,
not a claim of vendor acceptance, model capability or full tool support.
Pricing is omitted: **billing unknown; vendor API separate from plans**, not free.

T25/S7/S9 remain partial: relay/runtime wiring, live API verification and official
subscription routes are later units. OpenAI official DevKit/plan consent/SIWC UI,
Anthropic subscription use only through an unmodified official CLI, Gemini
Google-login official CLI, and Qwen Coding Plan entitlement are separate routes.
No subscription entitlement is converted into an API key here. No legacy guards,
network scope, local model settings, image, server or installed widget are changed.
