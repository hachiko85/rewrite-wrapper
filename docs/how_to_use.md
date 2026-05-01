# How to Use — rewrite-wrapper

## 目次 / Table of Contents

1. [起動手順 / Startup](#起動手順--startup)
2. [エンドポイント一覧 / Endpoint List](#エンドポイント一覧--endpoint-list)
3. [認証方式 / Authentication](#認証方式--authentication)
4. [リクエストパラメーター / Request Parameters](#リクエストパラメーター--request-parameters)
5. [エラーレスポンス仕様 / Error Response Spec](#エラーレスポンス仕様--error-response-spec)
6. [テストコマンド / Test Commands](#テストコマンド--test-commands)
7. [スロット制御 / Slot Control](#スロット制御--slot-control)

---

## 起動手順 / Startup

### 1. llama.cpp サーバーを起動

```bash
# スクリプトで起動 (N_PARALLEL=4 スロット設定済み)
bash /home/aceyutori/hachi-intelligence-project/rewrite-wrapper/llama-cpp-run-4b.sh
```

起動確認ログ (バックグラウンド起動の場合):
```
[llama-server] Starting Qwen3.5-4B (non-thinking mode):
  Model     : .../Qwen3.5-4B-UD-Q4_K_XL.gguf
  Port      : 8080
  GPU Layers: -1
  Ctx Size  : 8192
  Parallel  : 4 slots

main: model loaded
main: server is listening on http://localhost:8080
srv  update_slots: all slots are idle
```

バックグラウンドで起動する場合:
```bash
bash llama-cpp-run-4b.sh &>/tmp/llamacpp.log &
# 起動確認
tail -f /tmp/llamacpp.log
```

### 2. ラッパーサーバーを起動

```bash
cd /home/aceyutori/hachi-intelligence-project/rewrite-wrapper

# 本番起動
bun run start

# 開発用 (ファイル変更で自動再起動)
bun run dev
```

バックグラウンドで起動する場合:
```bash
bun run start &>/tmp/wrapper.log &
# 起動確認
cat /tmp/wrapper.log
```

起動確認ログ:
```
[MongoDB] Connected to database: k9db
[Server] Services initialized.
[Server] Starting on port 3000...
[Server] Upstream: http://localhost:8080
[Server] Listening on http://localhost:3000
```

### 3. 動作確認

```bash
curl http://localhost:3000/health
# {"status":"ok","upstream":"http://localhost:8080","timestamp":"..."}
```

---

## エンドポイント一覧 / Endpoint List

### プロキシエンドポイント (APIキー認証必須)

| Method | Path | 説明 |
|--------|------|------|
| `POST` | `/v1/chat/completions` | OpenAI互換チャット (llama.cppへ転送) |
| `POST` | `/v1/completions` | OpenAI互換テキスト補完 |
| `POST` | `/completion` | llama.cpp native API |

### 管理エンドポイント (MASTER_KEY認証必須)

| Method | Path | 説明 |
|--------|------|------|
| `POST` | `/admin/keys` | 新規APIキー発行 |
| `GET` | `/admin/keys` | APIキー一覧 |
| `DELETE` | `/admin/keys/:key` | APIキー無効化 |

### システムエンドポイント

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/health` | ヘルスチェック |

---

## 認証方式 / Authentication

### プロキシエンドポイント (APIキー)

**方法1: Authorization ヘッダー (推奨)**
```
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**方法2: POSTボディの `api_key` フィールド (llama.cpp互換)**
```json
{
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "messages": [...]
}
```

> `api_key` フィールドは llama.cpp への転送前に自動的に除去されます。

### 管理エンドポイント (MASTER_KEY)

```
X-Master-Key: <MASTER_KEY>
```

または:
```
Authorization: Bearer <MASTER_KEY>
```

---

## リクエストパラメーター / Request Parameters

### POST /v1/chat/completions

llama.cpp の OpenAI互換エンドポイントをそのまま使用できます。

```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user",   "content": "こんにちは"}
  ],
  "stream": true,
  "n_predict": 512,
  "temperature": 1.0,
  "top_k": 20,
  "top_p": 1.0
}
```

| パラメーター | 型 | デフォルト | 説明 |
|------------|-----|---------|------|
| `messages` | array | — | チャット履歴 (必須) |
| `stream` | boolean | `false` | SSEストリームを有効化 |
| `n_predict` | integer | `512` | 最大生成トークン数 (-1 で無制限) |
| `temperature` | float | `1.0` | サンプリング温度 |
| `top_k` | integer | `20` | Top-K サンプリング |
| `top_p` | float | `1.0` | Top-P サンプリング |
| `api_key` | string | — | APIキー (ラッパーが除去してから転送) |

> その他のllama.cppパラメーターも全て透過転送されます。

### POST /completion (llama.cpp native)

```json
{
  "prompt": "The capital of Japan is",
  "stream": true,
  "n_predict": 100,
  "api_key": "sk-xxxx"
}
```

---

## エラーレスポンス仕様 / Error Response Spec

### 統一エラーフォーマット

全エラーレスポンスは llama.cpp / OpenAI API と互換性のある形式を使用します。
クライアントは `error.type` フィールドでエラー種別を判定してください。

```json
{
  "error": {
    "code": <HTTPステータスコード>,
    "message": "<詳細メッセージ>",
    "type": "<エラー種別>"
  }
}
```

### エラー種別一覧

| HTTPコード | `error.type` | 原因 | クライアントの対処 |
|-----------|-------------|------|----------------|
| `401` | `authentication_error` | APIキー未提供または無効 | 正しいAPIキーを設定する |
| `403` | `permission_error` | MASTER_KEYが誤っている | 正しいMASTER_KEYを設定する |
| `400` | `invalid_request_error` | リクエスト形式が不正 | リクエストボディを修正する |
| `503` | `unavailable_error` | スロット満杯 | 少し待ってからリトライする |
| `502` | `server_error` | llama.cpp接続失敗 | llama.cppの起動を確認する |
| `500` | `server_error` | ラッパー内部エラー | サーバーログを確認する |
| `404` | `not_found_error` | エンドポイント未発見 | URLを確認する |

### エラーレスポンス例

**401 認証エラー:**
```json
{
  "error": {
    "code": 401,
    "message": "Invalid API key. Provide a valid key via Authorization: Bearer <key> or api_key field.",
    "type": "authentication_error"
  }
}
```

**503 スロット満杯:**
```json
{
  "error": {
    "code": 503,
    "message": "No available inference slots. All slots are currently occupied. Please retry later.",
    "type": "unavailable_error"
  }
}
```

**400 不正リクエスト (llama.cpp透過):**
```json
{
  "error": {
    "code": 400,
    "message": "'messages' is required",
    "type": "invalid_request_error"
  }
}
```

**502 上流接続失敗:**
```json
{
  "error": {
    "code": 502,
    "message": "Upstream LLM server is unavailable. Please check if llama.cpp is running.",
    "type": "server_error"
  }
}
```

### クライアント実装例 (JavaScript)

```javascript
async function chat(apiKey, messages) {
  const res = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, stream: true }),
  });

  // エラーハンドリング / Error handling
  if (!res.ok) {
    const { error } = await res.json();
    switch (error.type) {
      case 'authentication_error':
        throw new Error(`認証エラー: ${error.message}`);
      case 'unavailable_error':
        // 503: リトライ推奨 / Retry recommended
        console.warn('スロット満杯。3秒後にリトライ...');
        await new Promise(r => setTimeout(r, 3000));
        return chat(apiKey, messages); // リトライ
      case 'server_error':
        throw new Error(`サーバーエラー (${error.code}): ${error.message}`);
      default:
        throw new Error(`エラー: ${error.message}`);
    }
  }

  // SSEストリームの読み取り / Read SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') break;

      try {
        const chunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content ?? '';
        fullContent += content;
        process.stdout.write(content); // リアルタイム出力
      } catch {
        // llama.cppエラー (ストリーム内): {"error": {...}}
        try {
          const { error } = JSON.parse(data);
          throw new Error(`ストリームエラー: ${error.message}`);
        } catch {}
      }
    }
  }

  return fullContent;
}
```

---

## テストコマンド / Test Commands

### 前提: APIキーの発行

```bash
MASTER_KEY="master-change-me"

# 発行
KEY_RESPONSE=$(curl -s -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: $MASTER_KEY" \
  -d '{"name": "my-client"}')
echo "$KEY_RESPONSE"

# キーを変数に格納
API_KEY=$(echo "$KEY_RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
echo "API_KEY=$API_KEY"
```

### ヘルスチェック

```bash
curl http://localhost:3000/health
```

### SSEストリーミング

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"こんにちは"}],"stream":true,"n_predict":100}'
```

### ノンストリーム (通常レスポンス)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"こんにちは"}],"stream":false}'
```

### llama.cpp native API 経由 (api_key をボディに含む方式)

```bash
curl -X POST http://localhost:3000/completion \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$API_KEY\",\"prompt\":\"Hello\",\"n_predict\":50,\"stream\":false}"
```

### エラー系テスト

```bash
# 401: 無効なAPIキー
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
# → {"error":{"code":401,"type":"authentication_error",...}}

# 403: 誤ったMASTER_KEY
curl -X POST http://localhost:3000/admin/keys \
  -H "X-Master-Key: wrong" \
  -H "Content-Type: application/json" \
  -d '{"name":"x"}'
# → {"error":{"code":403,"type":"permission_error",...}}

# 400: 不正リクエスト (messagesなし)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"error":{"code":400,"type":"invalid_request_error",...}}

# 503: スロット満杯テスト
bash tests/phase3-slot/test_slot_overflow.sh "$API_KEY"
```

### 管理API

```bash
MASTER_KEY="master-change-me"

# キー一覧
curl http://localhost:3000/admin/keys \
  -H "X-Master-Key: $MASTER_KEY"

# キー無効化
curl -X DELETE "http://localhost:3000/admin/keys/$API_KEY" \
  -H "X-Master-Key: $MASTER_KEY"
```

### MongoDBログ確認

```bash
mongosh "mongodb://<MONGO_USER>:<MONGO_PASS>@localhost:27017/<MONGO_DB>?authSource=<MONGO_DB>" \
  --quiet \
  --eval "db.completion_logs.find().sort({created_at:-1}).limit(5).forEach(d => printjson(d))"
```

---

## スロット制御 / Slot Control

### 仕組み

```
llama-cpp-run-4b.sh の設定:
  --parallel 4   → 4スロット並列推論
  --ctx-size 8192 → 各スロット 2048 トークン (8192 / 4)

リクエスト受信時の処理:
  1. GET /slots?fail_on_no_slot=1 を呼び出し
  2. HTTP 200 → スロット空き → リクエスト転送
  3. HTTP 503 → スロット満杯 → クライアントに 503 を返す
```

### スロット設定の変更

`llama-cpp-run-4b.sh` の `N_PARALLEL` を変更:

```bash
N_PARALLEL=2  # 2スロットに変更
```

再起動が必要です。スロット数を増やすと1スロットあたりのコンテキストが減ります:
- `N_PARALLEL=1`: 8192 トークン/スロット
- `N_PARALLEL=4`: 2048 トークン/スロット
- `N_PARALLEL=8`: 1024 トークン/スロット

### 現在のスロット状態確認

```bash
# llama.cpp直接
curl http://localhost:8080/slots

# スロット空き確認 (200=空きあり, 503=満杯)
curl -w "HTTP: %{http_code}\n" http://localhost:8080/slots?fail_on_no_slot=1
```
