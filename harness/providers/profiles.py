"""Public, offline API profiles for a future host-only relay.

Import and offline metadata do not inspect credentials or open network connections.
The standard CLI may consult locale/terminal variables through argparse.
Credential resolution is explicit and accepts a caller-provided mapping.
"""

import argparse
from collections.abc import Mapping
from dataclasses import dataclass
import json
import re
import sys
from types import MappingProxyType


# Native protocols belong to Pi, not to a protocol-converting relay.
_ROUTES = MappingProxyType({
    "openai": ("openai-responses", "https://api.openai.com/v1", "/v1", "OPENAI_API_KEY"),
    "anthropic": ("anthropic-messages", "https://api.anthropic.com", "/", "ANTHROPIC_API_KEY"),
    "gemini": ("google-generative-ai", "https://generativelanguage.googleapis.com/v1beta", "/v1beta", "GEMINI_API_KEY"),
    "qwen": ("openai-completions", None, "/v1", "DASHSCOPE_API_KEY"),
})
_QWEN_UPSTREAMS = MappingProxyType({
    "cn": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "intl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
})


@dataclass(frozen=True, slots=True)
class APIProfile:
    """Validated selection only: never contains a key or a configurable URL."""

    provider: str
    model: str
    region: str | None = None

    def __post_init__(self):
        if not isinstance(self.provider, str) or self.provider not in _ROUTES:
            raise ValueError("Invalid provider.")
        if self.provider == "qwen":
            if not isinstance(self.region, str) or self.region not in _QWEN_UPSTREAMS:
                raise ValueError("Invalid region.")
        elif self.region is not None:
            raise ValueError("Invalid region.")
        # Bare native IDs only, including OpenAI fine-tune colon segments.
        alphabet = r"[A-Za-z0-9][A-Za-z0-9._:-]*" if self.provider == "openai" else r"[A-Za-z0-9][A-Za-z0-9._-]*"
        if (not isinstance(self.model, str) or len(self.model) > 256
                or not re.fullmatch(alphabet, self.model) or ".." in self.model):
            raise ValueError("Invalid model identifier.")

    @property
    def api(self):
        return _ROUTES[self.provider][0]

    @property
    def upstream(self):
        return _QWEN_UPSTREAMS[self.region] if self.provider == "qwen" else _ROUTES[self.provider][1]

    @property
    def key_env(self):
        return _ROUTES[self.provider][3]


def get_profile(provider: str, model: str, *, region: str | None = None) -> APIProfile:
    """Select explicitly; there is no default provider, model or region."""
    return APIProfile(provider, model, region)


def resolve_api_key(profile: APIProfile, environ: Mapping[str, str]) -> str:
    """Host callers supply their mapping; only the selected name is accessed.

    The returned key must remain in caller host memory, outside the container.
    """
    key = environ.get(profile.key_env)
    if (not isinstance(key, str) or not key or not key.isprintable()
            or any(char.isspace() for char in key) or key.startswith("sk-ant-oat")):
        raise ValueError("Invalid API key.")
    return key


def sdk_descriptor(profile: APIProfile) -> dict:
    """Fresh models.json-shaped metadata; not an activated or proven service.

    Cost and capability claims are deliberately omitted. Pi's Google transport
    uses an empty SDK apiVersion for a custom baseUrl already ending in /v1beta.
    """
    return {"providers": {f"{profile.provider}-cloud-api": {
        "name": f"{profile.provider} cloud API",
        "baseUrl": "http://127.0.0.1:18080" + _ROUTES[profile.provider][2],
        "api": profile.api,
        "apiKey": "doom-relay-placeholder",
        "models": [{"id": profile.model, "contextWindow": 32768, "maxTokens": 2048}],
    }}}


def describe_profile(profile: APIProfile) -> dict:
    """Stable public metadata, without resolving or checking credentials."""
    return {
        "provider": profile.provider, "model": profile.model, "region": profile.region,
        "api": profile.api, "upstream": profile.upstream, "keyEnv": profile.key_env,
        "billing": "unknown; vendor API separate from plans",
        "sdk": sdk_descriptor(profile),
    }


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally echoes untrusted values, including unknown options.
        raise ValueError("Invalid profile arguments.")


def main(argv=None) -> int:
    parser = _Parser(description=(
        "API profiles only: offline metadata, not cloud serving or activation. "
        "Vendor API billing is unknown and separate from subscription plans."),
        allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="list API provider identifiers; never resolve keys")
    describe = commands.add_parser("describe", help="describe an explicit API model; never resolve keys", allow_abbrev=False)
    describe.add_argument("--provider", required=True, help="openai, anthropic, gemini or qwen")
    describe.add_argument("--model", required=True, help="operator-supplied bare native model ID (not a URL)")
    describe.add_argument("--region", help="required for Qwen: cn or intl; rejected otherwise")
    try:
        args = parser.parse_args(argv)
        result = (list(_ROUTES) if args.command == "list" else
                  describe_profile(get_profile(args.provider, args.model, region=args.region)))
    except ValueError:
        print("Invalid profile arguments.", file=sys.stderr)
        return 2
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
