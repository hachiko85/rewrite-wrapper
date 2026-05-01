#!/bin/bash
# beta-test/curl/02-test-0.8b.sh
# Qwen3.5-0.8B バックエンドのストリーミングテスト。
# Streaming test for the Qwen3.5-0.8B backend.

WRAPPER_URL="${WRAPPER_URL:-http://localhost:3000}"
KEY_FILE="$(dirname "$0")/.api_key"
API_KEY="${API_KEY:-$(cat "$KEY_FILE" 2>/dev/null || true)}"

if [[ -z "$API_KEY" ]]; then
  echo "[ERROR] APIキーがありません。先に 00-setup.sh を実行してください"
  exit 1
fi

echo "========================================================"
echo "  Test 02: 0.8B ストリーミング / 0.8B Streaming"
echo "  Endpoint: $WRAPPER_URL/qwen3.5-0.8b/v1/chat/completions"
echo "========================================================"
echo ""

curl -N -s -X POST "$WRAPPER_URL/qwen3.5-0.8b/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello! What is 2+2? Answer briefly."}],
    "stream": true,
    "n_predict": 80
  }'

echo ""
echo ""
echo "  ✓ Test 02 完了"
