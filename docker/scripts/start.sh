#!/bin/bash
# docker/scripts/start.sh
# 本番起動スクリプト: llama.cpp → ヘルスチェック → Bun ラッパーの順に起動する
# Production startup: launches llama.cpp, waits for health, then starts Bun wrapper

set -euo pipefail

# ── 設定 / Configuration (環境変数で上書き可 / overridable via env vars) ──
LLAMA_BIN="/opt/llama.cpp/build/bin/llama-server"
MODEL_PATH="/models/${MODEL_FILE:-Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
N_PARALLEL="${N_PARALLEL:-4}"
CTX_SIZE="${CTX_SIZE:-8192}"
N_GPU_LAYERS="${N_GPU_LAYERS:--1}"
N_PREDICT="${N_PREDICT:-512}"
LLAMA_LOG="/app/logs/llamacpp.log"
HEALTH_TIMEOUT=120   # llama.cpp 起動タイムアウト秒数 / seconds to wait for llama.cpp

echo "================================================"
echo " rewrite-wrapper 起動シーケンス"
echo " Startup Sequence"
echo "================================================"

# ── モデルファイル確認 / Check model file ──
if [[ ! -f "$MODEL_PATH" ]]; then
  echo ""
  echo "[ERROR] モデルファイルが見つかりません / Model file not found:"
  echo "  $MODEL_PATH"
  echo ""
  echo "  MODELS_DIR 環境変数を設定し /models にマウントしてください。"
  echo "  Set MODELS_DIR and mount it to /models."
  echo "  例 / Example: MODELS_DIR=/home/user/gguf_models docker compose up"
  exit 1
fi

# ── GPU 確認 / Check GPU ──
echo ""
echo "[GPU] nvidia-smi:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "  (GPU情報取得失敗 / could not query GPU)"

# ── [1/3] llama.cpp 起動 / Start llama.cpp ──
echo ""
echo "[1/3] llama.cpp サーバーを起動中 / Starting llama.cpp server..."
echo "  Model     : $MODEL_PATH"
echo "  Port      : $LLAMA_PORT"
echo "  Slots     : $N_PARALLEL"
echo "  Ctx Size  : $CTX_SIZE"
echo "  GPU Layers: $N_GPU_LAYERS"
echo "  Log       : $LLAMA_LOG"

$LLAMA_BIN \
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
  --chat-template-kwargs '{"enable_thinking": false}' \
  &> "$LLAMA_LOG" &

LLAMA_PID=$!
echo "  PID: $LLAMA_PID"

# ── [2/3] llama.cpp ヘルスチェック待機 / Wait for llama.cpp health ──
echo ""
echo "[2/3] llama.cpp の起動を待機中 / Waiting for llama.cpp to be ready..."
ELAPSED=0
until curl -sf "http://localhost:${LLAMA_PORT}/health" > /dev/null 2>&1; do
  # プロセスが死んでいれば即終了 / Exit if process died
  if ! kill -0 "$LLAMA_PID" 2>/dev/null; then
    echo ""
    echo "[ERROR] llama.cpp が起動に失敗しました / llama.cpp failed to start"
    echo "  ログ / Log: $LLAMA_LOG"
    echo "--- 末尾50行 / Last 50 lines ---"
    tail -50 "$LLAMA_LOG" 2>/dev/null || true
    exit 1
  fi
  # タイムアウト確認 / Check timeout
  if [[ $ELAPSED -ge $HEALTH_TIMEOUT ]]; then
    echo ""
    echo "[ERROR] タイムアウト: ${HEALTH_TIMEOUT}秒以内に起動しませんでした"
    echo "  Timeout: llama.cpp did not start within ${HEALTH_TIMEOUT}s"
    kill "$LLAMA_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  # 10秒ごとに進捗表示 / Progress every 10s
  if [[ $((ELAPSED % 10)) -eq 0 ]]; then
    echo "  ... ${ELAPSED}s 経過"
  fi
done
echo "  起動完了 / Ready (${ELAPSED}s elapsed)"

# ── [3/3] Bun ラッパーサーバー起動 / Start Bun wrapper server ──
echo ""
echo "[3/3] ラッパーサーバーを起動中 / Starting wrapper server..."
echo "  Upstream  : http://localhost:${LLAMA_PORT}"
echo "  Port      : ${PORT:-3000}"
echo ""

# SIGTERM/SIGINT 受信時に llama.cpp も終了させる / Propagate signals to llama.cpp
trap "echo '[Server] シャットダウン中...'; kill $LLAMA_PID 2>/dev/null; exit 0" SIGTERM SIGINT

cd /app && exec bun run start
