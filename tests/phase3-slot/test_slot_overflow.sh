#!/bin/bash
# test_slot_overflow.sh
# スロットオーバーフローテスト / Slot overflow test
#
# 4スロット設定のllama.cppに対して5並列リクエストを送信し、
# 5番目が503を返すことを確認する。
#
# Sends 5 concurrent requests against a 4-slot llama.cpp instance
# and verifies the 5th returns 503.

TEST_KEY="${1:?Usage: $0 <api_key> [wrapper_url]}"
WRAPPER_URL="${2:-http://localhost:3000}"
N_PARALLEL=4
N_REQUESTS=5

echo "================================================"
echo " スロットオーバーフローテスト / Slot Overflow Test"
echo " Wrapper: $WRAPPER_URL"
echo " Slots:   $N_PARALLEL"
echo " Requests: $N_REQUESTS"
echo "================================================"
echo ""

RESULTS_DIR=$(mktemp -d)
PIDS=()

# スロットを長く占有するためのプロンプト (n_predict=2048) / Long-running prompt to occupy slots
LONG_PROMPT='{"messages":[{"role":"user","content":"1から1000まで英語で全て書いてください"}],"stream":true,"n_predict":2048}'
# 5番目: すぐに返るための短いプロンプト / 5th: short prompt for immediate response
SHORT_PROMPT='{"messages":[{"role":"user","content":"hi"}],"stream":false,"n_predict":5}'

echo "[1/2] $N_PARALLEL スロット占有リクエストを並列送信中..."
for i in $(seq 1 $N_PARALLEL); do
  curl -s -X POST "$WRAPPER_URL/v1/chat/completions" \
    -H "Authorization: Bearer $TEST_KEY" \
    -H "Content-Type: application/json" \
    -d "$LONG_PROMPT" \
    --max-time 60 \
    -o "$RESULTS_DIR/result_$i.txt" &
  PIDS+=($!)
  echo "  Request $i: PID=$!"
done

# スロットが全て占有されるまで少し待つ / Wait a moment for slots to be occupied
sleep 3

echo ""
echo "[2/2] 5番目のリクエストを送信 (503 expected)..."
FIFTH_RESULT=$(curl -s -X POST "$WRAPPER_URL/v1/chat/completions" \
  -H "Authorization: Bearer $TEST_KEY" \
  -H "Content-Type: application/json" \
  -d "$SHORT_PROMPT" \
  --max-time 10)

echo "5番目のレスポンス / 5th response:"
echo "$FIFTH_RESULT"

# 5番目が503かどうか確認 / Check if 5th returned 503
if echo "$FIFTH_RESULT" | grep -q '"unavailable_error"'; then
  echo ""
  echo "✅ PASS: 5番目のリクエストが 503 (unavailable_error) を返した"
else
  echo ""
  echo "❌ FAIL: 期待された 503 が返らなかった"
fi

# バックグラウンドプロセスを待機 / Wait for background processes
echo ""
echo "バックグラウンドリクエストの完了を待機中..."
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null
done

echo "完了。結果ファイル: $RESULTS_DIR/"
ls -la "$RESULTS_DIR/"
rm -rf "$RESULTS_DIR"
