# Phase 2 認証テスト / Authentication Tests

## 前提条件 / Prerequisites

- Phase 1 が完了していること
- サーバーが起動中 (`bun run start`)

## テスト手順 / Test Steps

### 1. APIキーを発行する / Issue an API key

```bash
curl -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: master-change-me" \
  -d '{"name": "test-key-1"}'
# 期待レスポンス (201):
# {"key":"sk-...","name":"test-key-1","created_at":"..."}
```

発行された `key` をメモする。以下 `<YOUR_KEY>` として使用。

### 2. 有効なキーで認証 → 認証通過を確認

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
# llama.cpp が起動していない場合は 502 が返る (認証は通っている)
# llama.cpp 起動中なら 200 + SSEストリーム
```

### 3. 無効なキーで認証失敗を確認

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer invalid-key-xxx" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
# 期待レスポンス (401):
# {"error":"Unauthorized"}
```

### 4. POSTボディの api_key フィールドで認証

```bash
curl -X POST http://localhost:3000/completion \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"<YOUR_KEY>\",\"prompt\":\"Hello\"}"
# 認証通過後、llama.cppへ api_key を除いて転送される
```

### 5. キー一覧確認

```bash
curl http://localhost:3000/admin/keys \
  -H "X-Master-Key: master-change-me"
# 期待レスポンス:
# {"keys":[{"_id":"...","name":"test-key-1","active":true,...}]}
```

### 6. キー無効化

```bash
curl -X DELETE http://localhost:3000/admin/keys/<YOUR_KEY> \
  -H "X-Master-Key: master-change-me"
# 期待レスポンス:
# {"message":"Key deactivated"}
```

## 期待される動作 / Expected Behavior

| テスト | 期待レスポンス |
|------|------|
| 有効キー (ヘッダー) | 認証通過 (200 or 502/503) |
| 有効キー (ボディ) | 認証通過 |
| 無効キー | 401 Unauthorized |
| キー未提供 | 401 Unauthorized |
| 管理API (正しいMASTER_KEY) | 200/201 |
| 管理API (誤ったMASTER_KEY) | 403 Forbidden |
