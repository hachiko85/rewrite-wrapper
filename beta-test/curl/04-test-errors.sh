#!/bin/bash
# beta-test/curl/04-test-errors.sh
# エラーレスポンス形式の確認テスト。
# Verifies error response format and status codes.

WRAPPER_URL="${WRAPPER_URL:-http://localhost:3000}"
KEY_FILE="$(dirname "$0")/.api_key"
VALID_KEY="${API_KEY:-$(cat "$KEY_FILE" 2>/dev/null || true)}"

PASS=0; FAIL=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ PASS [$label] HTTP $actual"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL [$label] expected $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================================"
echo "  Test 04: エラーレスポンス / Error Response Tests"
echo "========================================================"
echo ""

# 401: 無効なAPIキー / Invalid API key
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$WRAPPER_URL/qwen3.5-4b/v1/chat/completions" \
  -H "Authorization: Bearer sk-invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
check "401 Invalid key" "401" "$CODE"

# 403: 誤った MASTER_KEY / Wrong MASTER_KEY
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$WRAPPER_URL/admin/keys" \
  -H "X-Master-Key: wrong-master-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"x"}')
check "403 Wrong master key" "403" "$CODE"

# 404: 存在しないバックエンド / Non-existent backend
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$WRAPPER_URL/nonexistent-model/v1/chat/completions" \
  -H "Authorization: Bearer $VALID_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
check "404 Unknown backend" "404" "$CODE"

# 400: 不正リクエスト (messages なし) / Bad request
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$WRAPPER_URL/qwen3.5-4b/v1/chat/completions" \
  -H "Authorization: Bearer $VALID_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')
check "400 Bad request" "400" "$CODE"

# エラーフォーマット確認 / Verify error format
echo ""
echo "--- エラー形式確認 (401 レスポンスボディ) ---"
BODY=$(curl -s -X POST "$WRAPPER_URL/qwen3.5-4b/v1/chat/completions" \
  -H "Authorization: Bearer sk-bad" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
echo "  $BODY"
if echo "$BODY" | grep -q '"type":"authentication_error"'; then
  echo "  ✓ error.type フィールド確認済み"
  PASS=$((PASS + 1))
else
  echo "  ✗ error.type フィールドなし"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "========================================================"
echo "  結果: PASS=$PASS  FAIL=$FAIL"
echo "========================================================"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
