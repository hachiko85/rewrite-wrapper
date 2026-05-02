#!/bin/bash
# beta-test/raw/scripts/llama-run-gemma26b.sh
# Gemma-4-26B (画像認識対応) llama-server をホスト上で直接起動するスクリプト。
# Starts the Gemma-4-26B llama-server (with vision/mmproj) directly on the host.
#
# 環境変数でパスを上書き可能 / Override paths via environment variables:
#   LLAMA_BIN   - llama-server バイナリのパス (default: ~/llama.cpp/build/bin/llama-server)
#   MODELS_DIR  - モデルファイルのルートディレクトリ (default: ~/gguf_models)
#
# 使い方 / Usage:
#   bash beta-test/raw/scripts/llama-run-gemma26b.sh
#   MODELS_DIR=/data/models bash beta-test/raw/scripts/llama-run-gemma26b.sh

set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
MODELS_DIR="${MODELS_DIR:-$HOME/gguf_models}"
MODEL_PATH="$MODELS_DIR/unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf"
MMPROJ_PATH="$MODELS_DIR/unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf"

echo "================================================"
echo " Gemma-4-26B llama-server (vision)"
echo "  Binary  : $LLAMA_BIN"
echo "  Model   : $MODEL_PATH"
echo "  Mmproj  : $MMPROJ_PATH"
echo "  Port    : 8082"
echo "  Slots   : 2 (VRAM節約 / reduced for VRAM)"
echo "================================================"

if [[ ! -f "$MODEL_PATH" ]]; then
    echo "[ERROR] モデルファイルが見つかりません / Model file not found:"
    echo "  $MODEL_PATH"
    exit 1
fi

if [[ ! -f "$MMPROJ_PATH" ]]; then
    echo "[ERROR] mmproj ファイルが見つかりません / mmproj file not found:"
    echo "  $MMPROJ_PATH"
    exit 1
fi

exec "$LLAMA_BIN" \
    --model         "$MODEL_PATH" \
    --mmproj        "$MMPROJ_PATH" \
    --host          0.0.0.0 \
    --port          8082 \
    --ctx-size      8192 \
    --n-predict     512 \
    --n-gpu-layers  -1 \
    --parallel      2 \
    --temp          1.0 \
    --top-p         1.0 \
    --top-k         20 \
    --min-p         0.0 \
    --presence-penalty 2.0 \
    --repeat-penalty   1.0 \
    --metrics
