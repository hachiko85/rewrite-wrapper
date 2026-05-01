#!/bin/bash
# beta-test/curl/03-test-nostream.sh
# ノンストリームレスポンスのテスト (両バックエンド)。
# Non-streaming response test for both backends.

WRAPPER_URL="${WRAPPER_URL:-http://localhost:3000}"
KEY_FILE="$(dirname "$0")/.api_key"
API_KEY="${API_KEY:-$(cat "$KEY_FILE" 2>/dev/null || true)}"

if [[ -z "$API_KEY" ]]; then
  echo "[ERROR] APIキーがありません。先に 00-setup.sh を実行してください"
  exit 1
fi

echo "========================================================"
echo "  Test 03: ノンストリーム / Non-streaming"
echo "========================================================"

echo ""
echo "--- 4B (ノンストリーム) ---"
RESULT=$(curl -s -X POST "$WRAPPER_URL/qwen3.5-4b/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"1+1=?"}],"stream":false,"n_predict":20}')
echo "$RESULT" | grep -o '"content":"[^"]*"' | head -1 || echo "$RESULT"

echo ""
echo "--- 0.8B (ノンストリーム) ---"
RESULT=$(curl -s -X POST "$WRAPPER_URL/qwen3.5-0.8b/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"2+2=?"}],"stream":false,"n_predict":20}')
echo "$RESULT" | grep -o '"content":"[^"]*"' | head -1 || echo "$RESULT"

echo ""
echo "  ✓ Test 03 完了"
