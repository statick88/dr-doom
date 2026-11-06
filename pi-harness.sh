#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' \
    'Usage: ./pi-harness.sh [Pi arguments]' \
    'Start the separate controlled local-redteam profile.' \
    'Host shell requires interactive exact approval with target, scope, and local evidence.' \
    'lab_exec uses only existing digest-pinned Docker images in harness/lab-workspace; no network, pull, build, or assessment containers.' \
    'MCP is disabled: harness/mcp.disabled.json documents the capability gap.'
  exit 0
fi
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
exec pi --provider local-redteam --model qwen3-8b-redteam \
  --theme "$root/harness/themes/dr-doom.json" --use-theme dr-doom \
  --no-extensions --extension "$root/harness/extension.js" --extension "$root/harness/ui.js" \
  --no-mcp --no-skills --skill "$root/harness/skills/scoped-redteam" \
  --no-prompt-templates --no-context-files --no-approve \
  --append-system-prompt "$root/harness/system-guidance.md" \
  --tools read,grep,find,ls,bash,lab_exec --thinking off "$@"
