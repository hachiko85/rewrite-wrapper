# Phase 1 セットアップ確認 / Setup Verification

## 前提条件 / Prerequisites

- Bun がインストール済み (`bun --version`)
- MongoDB がローカルで稼働中
- `.env` が設定済み

## 動作確認手順 / Verification Steps

### 1. 依存パッケージ確認

```bash
cd /home/aceyutori/hachi-intelligence-project/rewrite-wrapper
bun install
```

### 2. TypeScript 型チェック

```bash
bun run tsc --noEmit 2>&1
```

### 3. サーバー起動

```bash
bun run start
# または
bun run dev  # ファイル変更時に自動再起動
```

### 4. ヘルスチェック

```bash
curl http://localhost:3000/health
# 期待レスポンス:
# {"status":"ok","upstream":"http://localhost:8080","timestamp":"..."}
```

### 5. MongoDB接続確認

```bash
mongosh "mongodb://k9_user:!!k9_user@localhost:27017/k9db?authSource=k9db" \
  --eval "db.api_keys.countDocuments()"
```

## 期待される動作 / Expected Behavior

| チェック項目 | 期待値 |
|------|------|
| `bun --version` | `1.3.13` |
| サーバー起動ログ | `[Server] Listening on http://localhost:3000` |
| `/health` レスポンス | `{"status":"ok", ...}` |
| MongoDB接続ログ | `[MongoDB] Connected to database: k9db` |

## トラブルシューティング / Troubleshooting

**MONGO_URI エラー**: `.env` の設定を確認する  
**MASTER_KEY エラー**: `.env` に `MASTER_KEY=...` を追加する  
**Port already in use**: `PORT` 環境変数で変更する
