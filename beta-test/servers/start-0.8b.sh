#!/bin/bash
# beta-test/servers/start-0.8b.sh
# Qwen3.5-0.8B を port 8082 でバックグラウンド起動する。
# Starts Qwen3.5-0.8B on port 8082 in the background.

set -euo pipefail

CMD="$HOME/llama.cpp/build/bin/llama-server"
MODEL="$HOME/gguf_models/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-UD-Q4_K_XL.gguf"
PORT=8082
N_PARALLEL=4
CTX_SIZE=8192
N_GPU_LAYERS=-1
LOG=/tmp/llamacpp-0.8b.log
PID_FILE=/tmp/llamacpp-0.8b.pid
HEALTH_TIMEOUT=120

# ── 存在チェック / Existence checks ──
if [[ ! -x "$CMD" ]]; then
  echo "[ERROR] llama-server が見つかりません: $CMD"; exit 1
fi
if [[ ! -f "$MODEL" ]]; then
  echo "[ERROR] モデルが見つかりません: $MODEL"; exit 1
fi

# ── 既起動確認 / Already running check ──
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[0.8B] 既に起動中 (PID=$(cat "$PID_FILE"), port $PORT)"
  exit 0
fi

echo "[0.8B] Qwen3.5-0.8B を起動中 (port $PORT)..."
echo "  Model  : $MODEL"
echo "  Slots  : $N_PARALLEL"
echo "  Log    : $LOG"

"$CMD" \
  --model               "$MODEL" \
  --host                localhost \
  --port                "$PORT" \
  --ctx-size            "$CTX_SIZE" \
  --n-predict           512 \
  --n-gpu-layers        "$N_GPU_LAYERS" \
  --parallel            "$N_PARALLEL" \
  --temp                1.0 \
  --top-p               1.0 \
  --top-k               20 \
  --min-p               0.0 \
  --presence-penalty    2.0 \
  --repeat-penalty      1.0 \
  --chat-template-kwargs '{"enable_thinking": false}' \
  --metrics \
  &>"$LOG" &

echo $! > "$PID_FILE"
echo "  PID    : $(cat "$PID_FILE")"
echo -n "  起動待機 "

ELAPSED=0
until curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; do
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo ""; echo "[ERROR] 起動失敗。ログ確認: $LOG"; tail -15 "$LOG"; exit 1
  fi
  if [[ $ELAPSED -ge $HEALTH_TIMEOUT ]]; then
    echo ""; echo "[ERROR] タイムアウト (${HEALTH_TIMEOUT}s)"; exit 1
  fi
  sleep 1; ELAPSED=$((ELAPSED + 1)); echo -n "."
done
echo " Ready (${ELAPSED}s)"
