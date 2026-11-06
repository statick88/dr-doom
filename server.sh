#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: ./server.sh' 'Run the local CPU-only Qwen3 server on 127.0.0.1:18080; stop with Ctrl+C.'
  exit 0
fi
if (( $# )); then
  printf '%s\n' 'Unexpected arguments. Use --help.' >&2
  exit 2
fi
LIB_DIR="$ROOT/runtime/build/bin"
if [[ -n "${LD_LIBRARY_PATH:-}" ]]; then
  export LD_LIBRARY_PATH="$LIB_DIR:$LD_LIBRARY_PATH"
else
  export LD_LIBRARY_PATH="$LIB_DIR"
fi
exec "$ROOT/runtime/build/bin/llama-server" \
  --model "$ROOT/models/qwen3-8b-abliterated-Q4_K_M.gguf" \
  --alias qwen3-8b-redteam --host 127.0.0.1 --port 18080 \
  --ctx-size 32768 --parallel 1 --threads 4 --threads-batch 4 \
  --n-gpu-layers 0 --jinja \
  --chat-template-kwargs '{"enable_thinking":false}'
