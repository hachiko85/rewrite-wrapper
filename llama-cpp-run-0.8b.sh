#!/bin/bash
# llama-server 起動スクリプト (Qwen3.5-0.8B, 非思考モード)
# Startup script for Qwen3.5-0.8B LLM server with thinking suppressed

# =============================
# 設定 / Configuration
# =============================
CMD="$HOME/llama.cpp/build/bin/llama-server"
MODEL_PATH="$HOME/gguf_models/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-UD-Q4_K_XL.gguf"
HOST="localhost"
PORT=8082
CTX_SIZE=8192
N_PREDICT=512
N_GPU_LAYERS=-1
THREADS=8
BATCH_SIZE=512
# 同時推論スロット数 / Number of parallel inference slots
N_PARALLEL=4

# Qwen3 非思考モード設定 / Qwen3 non-thinking mode
CHAT_TEMPLATE_KWARGS='{"enable_thinking": false}'

# =============================
# 存在チェック / Existence checks
# =============================
if [[ ! -x "$CMD" ]]; then
  echo "[ERROR] llama-server が見つかりません: $CMD"
  exit 1
fi

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "[ERROR] モデルが見つかりません: $MODEL_PATH"
  exit 1
fi

# =============================
# 起動処理 / Startup
# =============================
echo "[llama-server] Starting Qwen3.5-0.8B (non-thinking mode):"
echo "  Model     : $MODEL_PATH"
echo "  Port      : $PORT"
echo "  GPU Layers: $N_GPU_LAYERS"
echo "  Ctx Size  : $CTX_SIZE"
echo "  Parallel  : $N_PARALLEL slots"
echo ""

$CMD \
  --model               "$MODEL_PATH"            \
  --host                "$HOST"                   \
  --port                "$PORT"                   \
  --ctx-size            "$CTX_SIZE"               \
  --n-predict           "$N_PREDICT"              \
  --n-gpu-layers        "$N_GPU_LAYERS"           \
  --threads             "$THREADS"                \
  --batch-size          "$BATCH_SIZE"             \
  --parallel            "$N_PARALLEL"             \
  --temp                1.0                       \
  --top-p               1.0                       \
  --top-k               20                        \
  --min-p               0.0                       \
  --presence-penalty    2.0                       \
  --repeat-penalty      1.0                       \
  --chat-template-kwargs "$CHAT_TEMPLATE_KWARGS"  \
  --metrics
