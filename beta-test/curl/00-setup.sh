#!/bin/bash
# beta-test/curl/00-setup.sh
# APIキーを発行して .api_key ファイルに保存する。
# Issues an API key and saves it to the .api_key file.

WRAPPER_URL="${WRAPPER_URL:-http://localhost:3000}"
KEY_FILE="$(dirname "$0")/.api_key"

# .env から MASTER_KEY を読み込む / Load MASTER_KEY from .env
ENV_FILE="$(dirname "$0")/../../.env"
MASTER_KEY="${MASTER_KEY:-}"
if [[ -z "$MASTER_KEY" && -f "$ENV_FILE" ]]; then
  MASTER_KEY=$(grep "^MASTER_KEY=" "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'" 2>/dev/null || true)
fi
MASTER_KEY="${MASTER_KEY:-master-change-me}"

echo "========================================================"
echo "  APIキー発行 / Setup API Key"
echo "========================================================"
echo "  Wrapper : $WRAPPER_URL"
echo "  Key file: $KEY_FILE"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WRAPPER_URL/admin/keys" \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: $MASTER_KEY" \
  -d '{"name":"beta-test-key"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "  HTTP: $HTTP_CODE"
echo "  Body: $BODY"
echo ""

if [[ "$HTTP_CODE" != "201" ]]; then
  echo "[ERROR] APIキー発行に失敗しました (HTTP $HTTP_CODE)"
  echo "  MASTER_KEY が正しいか確認してください: $ENV_FILE"
  exit 1
fi

API_KEY=$(echo "$BODY" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
if [[ -z "$API_KEY" ]]; then
  echo "[ERROR] APIキーの抽出に失敗しました"
  exit 1
fi

echo "$API_KEY" > "$KEY_FILE"
echo "  ✓ API_KEY=$API_KEY"
echo "  → $KEY_FILE に保存しました"
echo ""
