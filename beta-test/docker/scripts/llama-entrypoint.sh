#!/bin/bash
# beta-test/docker/scripts/llama-entrypoint.sh
# Dockerコンテナ内でllama-serverを起動するエントリーポイント。
# Entrypoint that starts llama-server inside a Docker container.
#
# 環境変数 / Environment variables:
#   MODEL_FILE   - /models/ 以下のモデルパス (例: Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf)
#   LLAMA_PORT   - llama-server のリスンポート (default: 8080)
#   N_PARALLEL   - 同時スロット数 (default: 4)
#   CTX_SIZE     - コンテキストサイズ (default: 8192)
#   N_GPU_LAYERS - GPU レイヤー数 (-1 = 全層) (default: -1)
#   N_PREDICT    - 最大生成トークン数 (default: 512)

set -euo pipefail

LLAMA_BIN="/opt/llama/bin/llama-server"
MODEL_PATH="/models/${MODEL_FILE:?MODEL_FILE env var is required}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
N_PARALLEL="${N_PARALLEL:-4}"
CTX_SIZE="${CTX_SIZE:-8192}"
N_GPU_LAYERS="${N_GPU_LAYERS:--1}"
N_PREDICT="${N_PREDICT:-512}"

# ── 起動前確認 / Pre-flight checks ──
echo "================================================"
echo " llama-server エントリーポイント / Entrypoint"
echo "  Model     : $MODEL_PATH"
echo "  Port      : $LLAMA_PORT"
echo "  Slots     : $N_PARALLEL"
echo "  Ctx Size  : $CTX_SIZE"
echo "  GPU Layers: $N_GPU_LAYERS"
echo "================================================"

# モデルファイル確認 / Verify model file exists
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "[ERROR] モデルファイルが見つかりません / Model file not found:"
  echo "  $MODEL_PATH"
  echo ""
  echo "  MODELS_DIR を設定し /models にマウントしてください。"
  echo "  Set MODELS_DIR and mount it to /models."
  exit 1
fi

# GPU確認 / Check GPU
echo ""
echo "[GPU] nvidia-smi:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null \
  || echo "  (GPU情報取得失敗 / could not query GPU)"
echo ""

# llama-server 起動 (フォアグラウンド) / Start in foreground so container lives with it
echo "[llama] 起動中 / Starting llama-server..."
exec "$LLAMA_BIN" \
  --model               "$MODEL_PATH" \
  --host                "0.0.0.0" \
  --port                "$LLAMA_PORT" \
  --ctx-size            "$CTX_SIZE" \
  --n-predict           "$N_PREDICT" \
  --n-gpu-layers        "$N_GPU_LAYERS" \
  --parallel            "$N_PARALLEL" \
  --temp                1.0 \
  --top-p               1.0 \
  --top-k               20 \
  --min-p               0.0 \
  --presence-penalty    2.0 \
  --repeat-penalty      1.0 \
  --metrics \
  --chat-template-kwargs '{"enable_thinking": false}'
