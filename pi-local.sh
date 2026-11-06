#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: ./pi-local.sh [Pi arguments]' \
    'Start the isolated local-model profile. Start ./server.sh first.' \
    'Default tools: read, grep, find, ls (no command execution).' \
    'Extensions, MCP, skills, context files and project configuration are disabled.' \
    'Explicit --tools arguments may enable other Pi tools. No system sandbox is provided.'
  exit 0
fi
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
exec pi --provider local-redteam --model qwen3-8b-redteam \
  --no-extensions --no-mcp --no-skills --no-prompt-templates \
  --no-context-files --no-approve --tools read,grep,find,ls --thinking off "$@"
