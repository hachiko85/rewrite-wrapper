# SPEC.md — rewrite-wrapper API仕様書

## 概要 / Overview

llama.cpp / vllm などのLLMサーバーの前段に配置する薄いプロキシサーバーの仕様書。
Thin proxy server specification placed in front of LLM servers like llama.cpp / vllm.

- **Runtime**: Bun + Hono
- **Auth DB**: MongoDB (k9db.api_keys)
- **Upstream**: llama.cpp (localhost:8080)
- **Wrapper port**: 3000 (環境変数 PORT で変更可)

---

## エンドポイント一覧 / Endpoints

### プロキシエンドポイント (認証必須)

| Method | Path | 説明 / Description |
|--------|------|------|
| POST | `/v1/chat/completions` | OpenAI互換チャットAPI → llama.cppへ転送 |
| POST | `/v1/completions` | OpenAI互換completion API → llama.cppへ転送 |
| POST | `/completion` | llama.cpp native completion API → 転送 |

### 管理エンドポイント (MASTER_KEY認証)

| Method | Path | 説明 / Description |
|--------|------|------|
| POST | `/admin/keys` | 新規APIキー発行 |
| GET | `/admin/keys` | APIキー一覧取得 |
| DELETE | `/admin/keys/:key` | APIキー無効化 |

### システムエンドポイント

| Method | Path | 説明 / Description |
|--------|------|------|
| GET | `/health` | ヘルスチェック |

---

## 認証方式 / Authentication

APIキーは以下のいずれかの方法で送信できる。
API keys can be sent in any of the following ways:

1. **HTTP ヘッダー** (推奨): `Authorization: Bearer <api_key>`
2. **POSTボディ**: `{ "api_key": "<api_key>", ... }` (llama.cpp互換)

転送時の処理: POSTボディに `api_key` フィールドが存在する場合、上流サーバーへの転送前に除去する。
Processing on forward: If `api_key` field exists in POST body, it is removed before forwarding to upstream server.

---

## リクエスト処理フロー / Request Processing Flow

```
クライアント
  └─ POST /v1/chat/completions
      1. 認証ミドルウェア (authMiddleware)
         - Authorization ヘッダー or POSTボディ api_key を抽出
         - MongoDB k9db.api_keys で照合 (LRUキャッシュ付き)
         - 無効 → 401 Unauthorized
      2. スロット確認ミドルウェア (slotGuardMiddleware)
         - GET http://llama-cpp:8080/slots?fail_on_no_slot=1
         - 503 (空きなし) → 503 Service Unavailable をクライアントへ返却
         - 接続失敗 → 502 Bad Gateway
      3. ストリームプロキシ (StreamProxy)
         - POSTボディから api_key フィールドを除去
         - llama.cpp へ転送
         - SSEストリームをそのままパイプ
         - data: [DONE] 検知 → CompletionLogger 非同期起動
      4. ログ記録 (CompletionLogger)
         - MongoDB k9db.completion_logs へ非同期書き込み
```

---

## エラーレスポンス / Error Responses

| HTTPコード | 条件 | レスポンスボディ |
|--------|------|------|
| 401 | APIキー未提供または無効 | `{"error": "Unauthorized"}` |
| 503 | llama.cppスロット満杯 | `{"error": "No available slots"}` |
| 502 | llama.cppサーバー接続エラー | `{"error": "Upstream unavailable"}` |
| 500 | 内部エラー | `{"error": "Internal server error"}` |

---

## MongoDB スキーマ / MongoDB Schemas

### api_keys コレクション

```typescript
{
  _id:          ObjectId,
  key:          string,    // APIキー文字列 (indexed, unique)
  name:         string,    // 識別名
  active:       boolean,   // 有効フラグ
  created_at:   Date,
  last_used_at: Date | null
}
```

### completion_logs コレクション

```typescript
{
  _id:               ObjectId,
  api_key_id:        ObjectId,  // api_keys._id への参照
  model:             string,
  prompt_tokens:     number,
  completion_tokens: number,
  total_tokens:      number,
  latency_ms:        number,    // リクエスト開始から完了までのms
  created_at:        Date
}
```

---

## 環境変数 / Environment Variables

| 変数名 | デフォルト | 説明 |
|--------|----------|------|
| `MONGO_URI` | — | MongoDB接続URI (必須) |
| `MONGO_DB` | `k9db` | データベース名 |
| `MONGO_COLLECTION` | `api_keys` | APIキーコレクション名 |
| `LLAMA_CPP_URL` | `http://localhost:8080` | llama.cppサーバーURL |
| `PORT` | `3000` | ラッパーサーバーのリスンポート |
| `MASTER_KEY` | — | 管理エンドポイント認証キー (必須) |

---

## 制約・非機能要件 / Constraints & Non-functional Requirements

- APIキー照合: LRUキャッシュ (max: 1000, TTL: 60秒) でMongoDB往復を最小化
- スロット確認: 短期キャッシュ (TTL: 200ms) でN+1問題を回避
- ログ記録: 非同期・ノンブロッキング (ストリーム完了後)
- SSEストリーム: バッファリングなし、受信即転送
