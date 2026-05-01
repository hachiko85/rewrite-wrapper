# Phase 4 プロキシ・ストリームテスト / Proxy & Stream Tests

## 前提条件 / Prerequisites

- Phase 1〜3 が完了していること
- llama.cpp が起動中
- 有効なAPIキーが発行済み

## テスト手順 / Test Steps

### 1. SSEストリームの確認

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello, say hi!"}],"stream":true}'
# 期待: data: {"id":"...","object":"chat.completion.chunk",...} が複数行
# 最後: data: [DONE]
```

### 2. api_key フィールドが llama.cpp に転送されないことを確認

ラッパー経由でリクエストを送り、llama.cpp のログを確認:

```bash
# ラッパー経由 (api_key付きボディ)
curl -X POST http://localhost:3000/completion \
  -H "Content-Type: application/json" \
  -d '{"api_key":"<YOUR_KEY>","prompt":"Hello","n_predict":10,"stream":true}'
# → llama.cppのログにapi_keyが表示されないことを確認
```

### 3. ノンストリームリクエスト

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"stream":false}'
# 期待: {"id":"...","object":"chat.completion","choices":[...]}
```

### 4. 完了ログの確認 (MongoDB)

ストリームリクエスト完了後、MongoDBにログが記録されていることを確認:

```bash
mongosh "mongodb://k9_user:!!k9_user@localhost:27017/k9db?authSource=k9db" \
  --eval "db.completion_logs.find().sort({created_at:-1}).limit(3).pretty()"
# 期待: 最新の completion_logs が表示される
```

### 5. /v1/completions エンドポイント

```bash
curl -X POST http://localhost:3000/v1/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","prompt":"The sky is","max_tokens":20}'
```

## 期待される動作 / Expected Behavior

| テスト | 期待結果 |
|------|------|
| SSEストリーム | `data: {...}` が複数行 + `data: [DONE]` |
| api_key 除去 | llama.cppログにapi_keyなし |
| ノンストリーム | 完全なJSONレスポンス |
| 完了ログ | MongoDBに `completion_logs` が記録される |

## パフォーマンス確認 / Performance Check

```bash
# レイテンシ測定
time curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"stream":false}' > /dev/null
```
