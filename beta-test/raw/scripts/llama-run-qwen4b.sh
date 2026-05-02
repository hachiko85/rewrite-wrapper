#!/bin/bash
# beta-test/raw/scripts/llama-run-qwen4b.sh
# Qwen3.5-4B llama-server をホスト上で直接起動するスクリプト。
# Starts the Qwen3.5-4B llama-server directly on the host.
#
# 環境変数でパスを上書き可能 / Override paths via environment variables:
#   LLAMA_BIN   - llama-server バイナリのパス (default: ~/llama.cpp/build/bin/llama-server)
#   MODELS_DIR  - モデルファイルのルートディレクトリ (default: ~/gguf_models)
#
# 使い方 / Usage:
#   bash beta-test/raw/scripts/llama-run-qwen4b.sh
#   MODELS_DIR=/data/models bash beta-test/raw/scripts/llama-run-qwen4b.sh

set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
MODELS_DIR="${MODELS_DIR:-$HOME/gguf_models}"
MODEL_PATH="$MODELS_DIR/unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf"

echo "================================================"
echo " Qwen3.5-4B llama-server"
echo "  Binary : $LLAMA_BIN"
echo "  Model  : $MODEL_PATH"
echo "  Port   : 8081"
echo "  Slots  : 4"
echo "================================================"

if [[ ! -f "$MODEL_PATH" ]]; then
    echo "[ERROR] モデルファイルが見つかりません / Model file not found:"
    echo "  $MODEL_PATH"
    exit 1
fi

exec "$LLAMA_BIN" \
    --model         "$MODEL_PATH" \
    --host          0.0.0.0 \
    --port          8081 \
    --ctx-size      8192 \
    --n-predict     512 \
    --n-gpu-layers  -1 \
    --parallel      4 \
    --temp          1.0 \
    --top-p         1.0 \
    --top-k         20 \
    --min-p         0.0 \
    --presence-penalty 2.0 \
    --repeat-penalty   1.0 \
    --metrics \
    --chat-template-kwargs '{"enable_thinking": false}'
