#!/usr/bin/env sh
set -eu
flow=""
if [ "${1:-}" = "--flow" ]; then flow="$2"; shift 2; fi
export HOME="/tmp/home"
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
mkdir -p "$PI_CODING_AGENT_DIR"
cp /opt/doom/config/settings.json "$PI_CODING_AGENT_DIR/settings.json"
cp /opt/doom/config/models.json "$PI_CODING_AGENT_DIR/models.json"
if [ "${DOOM_LOCAL_CPU_POLICY:-}" = "1" ]; then
  node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" <<'JS'
import fs from "node:fs";
import { applyLocalPolicy } from "/opt/doom/model-proxy.mjs";
const file = process.argv[2];
fs.writeFileSync(file, JSON.stringify(applyLocalPolicy(JSON.parse(fs.readFileSync(file, "utf8")))));
JS
fi
mkdir -p "$PI_CODING_AGENT_DIR/themes"
cp /opt/doom/themes/dr-doom.json "$PI_CODING_AGENT_DIR/themes/dr-doom.json"
cd /workspace
export DOOM_MODEL_SOCKET="${DOOM_MODEL_SOCKET:?missing model bridge}"
node /opt/doom/model-proxy.mjs &
proxy_pid=$!
trap 'kill "$proxy_pid" 2>/dev/null || true' EXIT INT TERM
system_prompt=/tmp/doom-system.md
if [ -n "$flow" ]; then
  cat /opt/doom/guidance.md "/opt/doom/skills/$flow/SKILL.md" > "$system_prompt"
else
  cp /opt/doom/guidance.md "$system_prompt"
fi
set -- /opt/doom/node_modules/.bin/pi --no-extensions --no-skills --no-prompt-templates --no-themes --no-mcp --no-context-files --no-approve \
  --extension /opt/doom/node_modules/gentle-pi/extensions/gentle-ai.ts \
  --extension /opt/doom/node_modules/gentle-pi/extensions/gentle-agents.ts \
  --extension /opt/doom/node_modules/gentle-pi/extensions/gentle-shell.ts \
  --extension /opt/doom/extensions/ui.js \
  --provider local-redteam --model qwen3-8b-redteam --thinking off \
  --skill /opt/doom/node_modules/gentle-pi/skills \
  --skill /opt/doom/skills \
  --prompt-template /opt/doom/prompts \
  --theme /opt/doom/themes/dr-doom.json --use-theme dr-doom \
  --append-system-prompt "$system_prompt" "$@"
exec "$@"
