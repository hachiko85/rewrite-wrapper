#!/bin/bash
# beta-test/curl/01-test-4b.sh
# Qwen3.5-4B バックエンドのストリーミングテスト。
# Streaming test for the Qwen3.5-4B backend.

WRAPPER_URL="${WRAPPER_URL:-http://localhost:3000}"
KEY_FILE="$(dirname "$0")/.api_key"
API_KEY="${API_KEY:-$(cat "$KEY_FILE" 2>/dev/null || true)}"

if [[ -z "$API_KEY" ]]; then
  echo "[ERROR] APIキーがありません。先に 00-setup.sh を実行してください"
  exit 1
fi

echo "========================================================"
echo "  Test 01: 4B ストリーミング / 4B Streaming"
echo "  Endpoint: $WRAPPER_URL/qwen3.5-4b/v1/chat/completions"
echo "========================================================"
echo ""

curl -N -s -X POST "$WRAPPER_URL/qwen3.5-4b/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "日本語で自己紹介してください。3文以内で。"}],
    "stream": true,
    "n_predict": 150
  }'

echo ""
echo ""
echo "  ✓ Test 01 完了"
