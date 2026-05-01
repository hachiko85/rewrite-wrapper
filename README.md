# rewrite-wrapper

llama.cpp / vllm などのLLMサーバーの前段に配置する薄いプロキシサーバー。  
Thin proxy server placed in front of LLM servers like llama.cpp / vllm.

## 概要 / Overview

```
クライアント
    │  Authorization: Bearer sk-xxx
    ▼
[nginx]  ← リバースプロキシ (任意)
    │
    ▼
[rewrite-wrapper :3000]
    │  1. APIキー認証 (MongoDB + LRUキャッシュ)
    │  2. スロット空き確認 (/slots?fail_on_no_slot=1)
    │  3. api_key フィールドをボディから除去
    ▼
[llama.cpp :8080]  ← SSEストリームをそのままパイプ
```

| 機能 | 詳細 |
|------|------|
| APIキー認証 | MongoDB照合 + LRUキャッシュ (TTL 60s) による高速検証 |
| スロット管理 | llama.cpp `/slots` エンドポイントで満杯時に 503 返却 |
| SSEストリーム | TransformStream でバッファなしリアルタイム転送 |
| 完了ログ | `data: [DONE]` 検知後に非同期で MongoDB へ記録 |
| 統一エラー形式 | `{"error":{"code":N,"message":"...","type":"..."}}` (llama.cpp/OpenAI互換) |

## 構成 / Stack

| レイヤー | 技術 |
|----------|------|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Hono](https://hono.dev) |
| Auth DB | MongoDB |
| Cache | lru-cache (v11) |
| Upstream | llama.cpp / vllm |

---

## デプロイ手順 / Deployment

### 1. 前提条件の確認

```bash
# Bun (未インストールの場合)
npm install -g bun
bun --version   # 1.3.x 以上

# MongoDB が稼働していることを確認
mongosh --eval "db.adminCommand('ping')"

# llama.cpp ビルド済みであることを確認
~/llama.cpp/build/bin/llama-server --version
```

### 2. リポジトリのクローン

```bash
git clone <repo-url> rewrite-wrapper
cd rewrite-wrapper
```

### 3. 依存パッケージのインストール

```bash
bun install
```

### 4. 環境変数の設定

`.env` ファイルを編集します。

```bash
cp .env.example .env   # テンプレートがある場合
```

```env
# MongoDB接続 / MongoDB connection
MONGO_URI=mongodb://k9_user:!!k9_user@localhost:27017/k9db?authSource=k9db
MONGO_DB=k9db
MONGO_COLLECTION=api_keys
MONGO_LOGS_COLLECTION=completion_logs

# llama.cppサーバー / llama.cpp server URL
LLAMA_CPP_URL=http://localhost:8080

# ラッパーサーバーポート / Wrapper server port
PORT=3000

# 管理APIキー (必ず変更すること) / Master key — CHANGE THIS
MASTER_KEY=your-secret-master-key
```

> **重要**: `MASTER_KEY` は推測困難な文字列に変更してください。  
> 管理APIへのアクセス制御に使用します。

### 5. MongoDBのコレクション初期化

初回起動時にインデックスは自動作成されますが、ユーザーが存在しない場合は事前に作成してください。

```bash
mongosh "mongodb://k9_user:!!k9_user@localhost:27017/k9db?authSource=k9db" --eval "
  db.api_keys.createIndex({ key: 1 }, { unique: true });
  db.completion_logs.createIndex({ created_at: -1 });
  print('Indexes created.');
"
```

### 6. llama.cpp サーバーの起動

```bash
# フォアグラウンド
bash llama-cpp-run-4b.sh

# バックグラウンド
bash llama-cpp-run-4b.sh &>/tmp/llamacpp.log &
tail -f /tmp/llamacpp.log   # 起動ログ確認
```

起動確認ログ:
```
[llama-server] Starting Qwen3.5-4B (non-thinking mode):
  Model     : .../Qwen3.5-4B-UD-Q4_K_XL.gguf
  Port      : 8080
  Parallel  : 4 slots
main: server is listening on http://localhost:8080
```

スロット数の変更は `llama-cpp-run-4b.sh` の `N_PARALLEL` を編集します。

```bash
N_PARALLEL=4   # スロット数。増やすと1スロットあたりのctxが減る
```

| N_PARALLEL | ctx / slot | 用途 |
|-----------|-----------|------|
| 1 | 8192 | 長文生成優先 |
| 4 | 2048 | バランス (デフォルト) |
| 8 | 1024 | 同時接続数優先 |

### 7. ラッパーサーバーの起動

```bash
# 本番起動
bun run start

# 開発 (ファイル変更時に自動再起動)
bun run dev

# バックグラウンド
bun run start &>/tmp/wrapper.log &
cat /tmp/wrapper.log   # 起動ログ確認
```

起動確認ログ:
```
[MongoDB] Connected to database: k9db
[Server] Services initialized.
[Server] Starting on port 3000...
[Server] Upstream: http://localhost:8080
[Server] Listening on http://localhost:3000
```

### 8. 動作確認

```bash
curl http://localhost:3000/health
# {"status":"ok","upstream":"http://localhost:8080","timestamp":"..."}
```

### 9. (任意) nginx リバースプロキシの設定

`docs/nginx.conf.example` をベースに設定します。  
SSEストリームのためにバッファリング無効化が必須です。

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;   # LLM生成に備えてタイムアウトを延長
```

詳細は `docs/nginx.conf.example` を参照。

---

## APIキー管理 / API Key Management

管理エンドポイントは `X-Master-Key` ヘッダーで認証します。

### キー発行

```bash
curl -s -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: your-secret-master-key" \
  -d '{"name": "my-client"}'
# {"key":"sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","name":"my-client","created_at":"..."}
```

### キー一覧

```bash
curl http://localhost:3000/admin/keys \
  -H "X-Master-Key: your-secret-master-key"
```

### キー無効化

```bash
curl -X DELETE "http://localhost:3000/admin/keys/sk-xxxx" \
  -H "X-Master-Key: your-secret-master-key"
```

---

## 使い方 / Usage

### 認証方法

```bash
# 方法1: Authorization ヘッダー (推奨)
-H "Authorization: Bearer sk-xxxx"

# 方法2: POSTボディの api_key フィールド (llama.cpp互換)
-d '{"api_key": "sk-xxxx", "messages": [...]}'
```

### SSEストリーミング

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"こんにちは"}],"stream":true,"n_predict":512}'
```

### ノンストリームレスポンス

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"こんにちは"}],"stream":false}'
```

### llama.cpp native API

```bash
curl -X POST http://localhost:3000/completion \
  -H "Content-Type: application/json" \
  -d '{"api_key":"sk-xxxx","prompt":"Hello","n_predict":50,"stream":false}'
```

---

## エンドポイント一覧 / Endpoints

### プロキシ (APIキー認証必須)

| Method | Path | 説明 |
|--------|------|------|
| `POST` | `/v1/chat/completions` | OpenAI互換チャット → llama.cpp転送 |
| `POST` | `/v1/completions` | OpenAI互換completion → llama.cpp転送 |
| `POST` | `/completion` | llama.cpp native API転送 |

### 管理 (MASTER_KEY認証必須)

| Method | Path | 説明 |
|--------|------|------|
| `POST` | `/admin/keys` | APIキー発行 |
| `GET` | `/admin/keys` | APIキー一覧 |
| `DELETE` | `/admin/keys/:key` | APIキー無効化 |

### システム

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/health` | ヘルスチェック |

---

## エラーレスポンス / Error Responses

全エラーは以下の統一フォーマットで返却されます。

```json
{
  "error": {
    "code": 401,
    "message": "Invalid API key. ...",
    "type": "authentication_error"
  }
}
```

| HTTP | `type` | 原因 |
|------|--------|------|
| `401` | `authentication_error` | APIキー未提供・無効 |
| `403` | `permission_error` | MASTER_KEY 不一致 |
| `400` | `invalid_request_error` | リクエスト形式不正 |
| `503` | `unavailable_error` | スロット全占有 → リトライ推奨 |
| `502` | `server_error` | llama.cpp 接続失敗 |
| `500` | `server_error` | ラッパー内部エラー |
| `404` | `not_found_error` | 存在しないパス |

---

## SSEストリーム形式 / SSE Stream Format

### 通常チャンク

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"こん"},"finish_reason":null}],"model":"qwen2.5-4b-q4"}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"にちは"},"finish_reason":null}],"model":"qwen2.5-4b-q4"}
```

### 最終チャンク (生成完了)

```
data: {"choices":[{"delta":{},"finish_reason":"stop"}],"timings":{"prompt_n":12,"predicted_n":87},"model":"qwen2.5-4b-q4"}

data: [DONE]
```

### ストリーム内エラー

```
data: {"error":{"code":500,"message":"...","type":"server_error"}}
```

`choices` がなく `error` キーが存在する行がストリームエラーです。

---

## テスト / Tests

各テストの実行方法は各ディレクトリの `how_to_use.md` を参照。

```
tests/
├── phase3-slot/
│   ├── test_slot_overflow.sh   # 503スロット超過テスト
│   └── how_to_use.md
```

```bash
# スロットオーバーフローテスト (4スロット占有 → 5番目が503)
bash tests/phase3-slot/test_slot_overflow.sh sk-xxxx
```

---

## ドキュメント / Documentation

| ファイル | 内容 |
|----------|------|
| `SPEC.md` | API仕様書 (スキーマ・フロー図) |
| `docs/how_to_use.md` | 起動手順・テストコマンド・エラー仕様の詳細 |
| `docs/architecture.drawio` | アーキテクチャ図 ([draw.io](https://app.diagrams.net) で開く) |
| `docs/nginx.conf.example` | nginx リバースプロキシ設定テンプレート |
