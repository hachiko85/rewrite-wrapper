#!/bin/bash
# beta-test/servers/start-wrapper.sh
# Bun ラッパーサーバーをバックグラウンドで起動する。
# Starts the Bun wrapper server in the background.

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT="${PORT:-3000}"
LOG=/tmp/wrapper.log
PID_FILE=/tmp/wrapper.pid

# ── 既起動確認 / Already running check ──
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[Wrapper] 既に起動中 (PID=$(cat "$PID_FILE"), port $PORT)"
  exit 0
fi

echo "[Wrapper] ラッパーサーバーを起動中 (port $PORT)..."
echo "  Root   : $PROJECT_ROOT"
echo "  Log    : $LOG"

cd "$PROJECT_ROOT"
bun run start &>"$LOG" &

echo $! > "$PID_FILE"
echo "  PID    : $(cat "$PID_FILE")"
echo -n "  起動待機 "

ELAPSED=0
until curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; do
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo ""; echo "[ERROR] 起動失敗。ログ確認: $LOG"; tail -20 "$LOG"; exit 1
  fi
  if [[ $ELAPSED -ge 30 ]]; then
    echo ""; echo "[ERROR] タイムアウト (30s)"; exit 1
  fi
  sleep 1; ELAPSED=$((ELAPSED + 1)); echo -n "."
done
echo " Ready (${ELAPSED}s)"
