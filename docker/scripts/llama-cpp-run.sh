#!/bin/bash
# docker/scripts/llama-cpp-run.sh
# 対話モード用: コンテナ内から llama.cpp を手動起動するスクリプト
# Interactive mode: manually start llama.cpp inside the container
#
# 使い方 / Usage:
#   bash /app/docker/scripts/llama-cpp-run.sh              # フォアグラウンド / foreground
#   bash /app/docker/scripts/llama-cpp-run.sh --background # バックグラウンド / background

LLAMA_BIN="/opt/llama.cpp/build/bin/llama-server"
MODEL_PATH="/models/${MODEL_FILE:-Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
N_PARALLEL="${N_PARALLEL:-4}"
CTX_SIZE="${CTX_SIZE:-8192}"
N_GPU_LAYERS="${N_GPU_LAYERS:--1}"
N_PREDICT="${N_PREDICT:-512}"

# モデルファイル確認 / Check model file
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "[ERROR] モデルファイルが見つかりません / Model file not found:"
  echo "  $MODEL_PATH"
  echo ""
  echo "  /models ディレクトリの内容 / Contents of /models:"
  find /models -name "*.gguf" 2>/dev/null || echo "  (ファイルなし / no files found)"
  exit 1
fi

echo "[llama-server] Starting (container mode):"
echo "  Model     : $MODEL_PATH"
echo "  Port      : $LLAMA_PORT"
echo "  GPU Layers: $N_GPU_LAYERS"
echo "  Ctx Size  : $CTX_SIZE"
echo "  Parallel  : $N_PARALLEL slots"
echo ""

CMD=(
  "$LLAMA_BIN"
  --model               "$MODEL_PATH"
  --host                "0.0.0.0"
  --port                "$LLAMA_PORT"
  --ctx-size            "$CTX_SIZE"
  --n-predict           "$N_PREDICT"
  --n-gpu-layers        "$N_GPU_LAYERS"
  --parallel            "$N_PARALLEL"
  --temp                1.0
  --top-p               1.0
  --top-k               20
  --min-p               0.0
  --presence-penalty    2.0
  --repeat-penalty      1.0
  --metrics
  --chat-template-kwargs '{"enable_thinking": false}'
)

if [[ "${1:-}" == "--background" ]]; then
  # バックグラウンド起動 / Background startup
  "${CMD[@]}" &>/app/logs/llamacpp.log &
  echo "  PID: $! (ログ: /app/logs/llamacpp.log)"
  echo ""
  echo "  ヘルスチェック / Health check:"
  echo "    curl http://localhost:$LLAMA_PORT/health"
  echo ""
  echo "  ログ確認 / Watch log:"
  echo "    tail -f /app/logs/llamacpp.log"
else
  # フォアグラウンド起動 / Foreground startup
  "${CMD[@]}"
fi
