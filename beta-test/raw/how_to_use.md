# β テスト — 素の環境での実行手順 / Running Without Docker

Docker を使わず、ホスト上の Bun + llama-server で直接動かす方法。  
Qwen3.5-4B（テキスト）+ Gemma-4-26B（画像認識）の2モデル同時稼働を例に説明する。

---

## 全体構成 / Architecture

```
クライアント
    ↓
ラッパーサーバー (Bun/Hono) :3085    ← git clone して bun run start
    ├── /qwen3.5-4b/... → localhost:8081
    └── /gemma-4-26b/... → localhost:8082

localhost:8081  llama-server (Qwen3.5-4B)      ← 手動またはスクリプトで起動
localhost:8082  llama-server (Gemma-4-26B)     ← 手動またはスクリプトで起動

localhost:27017  MongoDB                        ← 認証情報を .env に記述
```

---

## 前提条件 / Prerequisites

| 必要なもの | 確認コマンド |
|-----------|-------------|
| Bun 1.0+ | `bun --version` |
| llama-server ビルド済み | `~/llama.cpp/build/bin/llama-server --version` |
| GGUF モデルファイル | `ls $HOME/gguf_models/unsloth/` |
| MongoDB 稼働中 | `mongosh --eval "db.adminCommand('ping')"` |

### Bun のインストール (未インストールの場合)

```bash
curl -fsSL https://bun.sh/install | bash
# シェルを再起動するか source ~/.bashrc
```

---

## ステップ 1: リポジトリをクローン / Clone

```bash
git clone https://github.com/hachiko85/rewrite-wrapper.git
cd rewrite-wrapper
```

---

## ステップ 2: 依存パッケージをインストール / Install dependencies

TypeScript のコンパイルは不要。Bun がソースをそのまま実行する。

```bash
bun install
```

---

## ステップ 3: .env を作成 / Create .env

プロジェクトルートに `.env` を作成する。

```bash
cp beta-test/raw/.env.example .env
```

`.env` を編集して実際の値を設定する:

```bash
# MongoDB 接続URI
# 書式: mongodb://ユーザー名:パスワード@localhost:27017/DB名?authSource=admin
MONGO_URI=mongodb://k9_user:yourpassword@localhost:27017/k9db?authSource=admin

# データベース・コレクション名 (デフォルトのままでOK)
MONGO_DB=k9db
MONGO_COLLECTION=api_keys
MONGO_LOGS_COLLECTION=completion_logs

# ラッパーサーバーの設定
MASTER_KEY=your-secret-master-key-here   # 管理API認証キー (自由に設定)
PORT=3085                                 # ラッパーのリスンポート
BACKENDS_CONFIG=./beta-test/raw/backends.yaml  # バックエンド設定ファイル
```

### MongoDB ユーザーの作成 (未作成の場合)

```bash
mongosh

# MongoDB シェル内で実行 / Run inside mongosh
use admin
db.createUser({
  user: "k9_user",
  pwd: "yourpassword",
  roles: [{ role: "readWrite", db: "k9db" }]
})
exit
```

> コレクション (`api_keys`, `completion_logs`) はサーバー初回起動時に自動作成される。  
> Collections are auto-created on first server startup — no manual setup needed.

---

## ステップ 4: バックエンド設定を確認 / Check backends config

`beta-test/raw/backends.yaml` がバックエンドのルーティングを定義している。  
`.env` の `BACKENDS_CONFIG` でこのファイルを指定済みなので**変更不要**。

```yaml
# beta-test/raw/backends.yaml (内容確認用)
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081   # Qwen llama-server のポート
    pathPrefix: /qwen3.5-4b

  - name: gemma-4-26b
    url: http://localhost:8082   # Gemma llama-server のポート
    pathPrefix: /gemma-4-26b
```

モデルを追加・変更する場合はこのファイルを直接編集する。  
変更はラッパーサーバーの**再起動**で反映される（再インストール不要）。

---

## ステップ 5: モデルファイルを確認 / Verify model files

```bash
ls $HOME/gguf_models/unsloth/Qwen3.5-4B-GGUF/
# → Qwen3.5-4B-UD-Q4_K_XL.gguf

ls $HOME/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/
# → gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
# → mmproj-BF16.gguf
```

---

## ステップ 6: llama-server を起動 / Start llama-servers

2つのターミナルで別々に起動する。バックグラウンド起動も可能（後述）。

### ターミナル A — Qwen3.5-4B (テキスト)

```bash
# スクリプトで起動 / Using the provided script
bash beta-test/raw/scripts/llama-run-qwen4b.sh

# または手動で / Or manually
~/llama.cpp/build/bin/llama-server \
    --model  $HOME/gguf_models/unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf \
    --host 0.0.0.0 --port 8081 \
    --ctx-size 8192 --n-gpu-layers -1 --parallel 4 --metrics
```

### ターミナル B — Gemma-4-26B (画像認識)

```bash
# スクリプトで起動 / Using the provided script
bash beta-test/raw/scripts/llama-run-gemma26b.sh

# または手動で / Or manually
~/llama.cpp/build/bin/llama-server \
    --model   $HOME/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf \
    --mmproj  $HOME/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf \
    --host 0.0.0.0 --port 8082 \
    --ctx-size 8192 --n-gpu-layers -1 --parallel 2 --metrics
```

### バックグラウンドで起動する場合 / Background startup

```bash
# nohup でバックグラウンド起動 / Start in background with nohup
nohup bash beta-test/raw/scripts/llama-run-qwen4b.sh   > /tmp/llama-qwen4b.log 2>&1 &
nohup bash beta-test/raw/scripts/llama-run-gemma26b.sh > /tmp/llama-gemma26b.log 2>&1 &

# ログ確認 / Check logs
tail -f /tmp/llama-qwen4b.log
tail -f /tmp/llama-gemma26b.log

# プロセス確認 / Check processes
pgrep -a llama-server
```

llama-server の起動完了は以下のログで確認できる:
```
llama server listening at http://0.0.0.0:8081
```

---

## ステップ 7: ラッパーサーバーを起動 / Start the wrapper server

**別のターミナルで**プロジェクトルートから実行する。

```bash
cd rewrite-wrapper   # プロジェクトルートであることを確認

# 本番起動 / Production
bun run start

# 開発モード (ファイル変更で自動再起動) / Dev mode with auto-reload
bun run dev
```

起動成功時の出力:
```
[Server] Services initialized.
[Server] Starting on port 3085...
[Server] Backends config: ./beta-test/raw/backends.yaml
[Server] Listening on http://localhost:3085
```

---

## ステップ 8: 動作確認 / Verify

```bash
# ヘルスチェック / Health check
curl http://localhost:3085/health

# バックエンド一覧 / List backends
curl -s http://localhost:3085/backends | jq .
```

期待される出力:
```json
{
  "backends": [
    {"name": "qwen3.5-4b",  "pathPrefix": "/qwen3.5-4b"},
    {"name": "gemma-4-26b", "pathPrefix": "/gemma-4-26b"}
  ]
}
```

---

## ステップ 9: API キーを発行 / Issue an API key

ラッパーサーバーへのリクエストには API キーが必要。  
`.env` の `MASTER_KEY` を使って管理 API でキーを発行する。

```bash
# API キー発行 / Issue API key
curl -s -X POST http://localhost:3085/admin/keys \
  -H "X-Master-Key: your-secret-master-key-here" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-test-key"}' | jq .
```

レスポンス例:
```json
{
  "key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "my-test-key",
  "created_at": "2026-05-02T00:00:00.000Z"
}
```

```bash
# キー一覧 / List keys
curl -s http://localhost:3085/admin/keys \
  -H "X-Master-Key: your-secret-master-key-here" | jq .

# キー無効化 / Deactivate a key
curl -s -X DELETE http://localhost:3085/admin/keys/<key> \
  -H "X-Master-Key: your-secret-master-key-here"
```

---

## ステップ 10: 推論テスト / Test inference

### Qwen3.5-4B — テキスト生成

```bash
curl -s http://localhost:3085/qwen3.5-4b/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-4b",
    "messages": [{"role": "user", "content": "日本語で自己紹介してください。"}],
    "stream": false
  }' | jq .choices[0].message.content
```

### Gemma-4-26B — 画像認識

```bash
IMAGE_B64=$(base64 -w0 /path/to/your/image.jpg)

curl -s http://localhost:3085/gemma-4-26b/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gemma-4-26b\",
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        {\"type\": \"image_url\", \"image_url\": {\"url\": \"data:image/jpeg;base64,${IMAGE_B64}\"}},
        {\"type\": \"text\", \"text\": \"この画像を説明してください。\"}
      ]
    }],
    \"stream\": false
  }" | jq .choices[0].message.content
```

---

## モデルの追加・変更 / Add or change models

1. `beta-test/raw/backends.yaml` にエントリを追加:

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081
    pathPrefix: /qwen3.5-4b

  - name: gemma-4-26b
    url: http://localhost:8082
    pathPrefix: /gemma-4-26b

  - name: new-model          # ← 追加
    url: http://localhost:8083
    pathPrefix: /new-model
```

2. 新しい llama-server を対応ポートで起動

3. ラッパーサーバーを再起動 (`Ctrl+C` → `bun run start`)

---

## ファイル構成 / File layout

```
rewrite-wrapper/                  ← プロジェクトルート
├── .env                          ← 作成した設定ファイル (gitignore済み)
├── apps/server/src/              ← Bun/Hono ソースコード
├── package.json
├── bun.lock
└── beta-test/raw/
    ├── how_to_use.md             ← このファイル
    ├── .env.example              ← .env のテンプレート
    ├── backends.yaml             ← バックエンドルーティング設定
    └── scripts/
        ├── llama-run-qwen4b.sh   ← Qwen3.5-4B 起動スクリプト
        └── llama-run-gemma26b.sh ← Gemma-4-26B + mmproj 起動スクリプト
```

---

## 参考: Docker 版との違い / vs. Docker setup

| 項目 | 素の環境 (this guide) | Docker (`beta-test/docker/`) |
|------|----------------------|------------------------------|
| llama-server | ホストで直接起動 | コンテナ内でビルド・起動 |
| プロセス管理 | 手動 / nohup / systemd | supervisord が自動管理 |
| MongoDB | ホストに直接接続 | `network_mode: host` で接続 |
| 環境の再現性 | ホスト依存 | `docker build` で完全再現 |
| セットアップの手軽さ | Bun のみ必要、即起動 | ビルドに15〜30分 |
