# β テスト Docker — 実装例と作業手順 / Implementation Examples & Workflow

**このドキュメントについて / About this document**  
リポジトリの `git clone` からモデルが動くまでの完全な手順を、  
Qwen3.5-4B（テキスト）+ Gemma-4-26B（画像認識）の**2モデル同時稼働**を例に説明する。

---

## 前提条件 / Prerequisites

| 必要なもの | 確認コマンド |
|-----------|-------------|
| Docker Engine 24+ | `docker --version` |
| Docker Compose v2+ | `docker compose version` |
| NVIDIA Container Toolkit | `docker run --rm --gpus all ubuntu nvidia-smi` |
| GGUF モデルファイル | `ls $HOME/gguf_models/` |
| MongoDB 稼働中 | `mongosh --eval "db.adminCommand('ping')"` |

> NVIDIA Container Toolkit のセットアップ方法は `how_to_use.md` の末尾を参照。

---

## ステップ 1: リポジトリをクローン / Clone the repository

```bash
git clone https://github.com/hachiko85/rewrite-wrapper.git
cd rewrite-wrapper
```

---

## ステップ 2: .env を作成 / Create .env

プロジェクトルートに `.env` を作成する。MongoDB の認証情報と管理キーを設定する。

```bash
cat > .env << 'EOF'
# MongoDB 接続URI (認証あり)
# MongoDB connection URI (with auth)
MONGO_URI=mongodb://username:password@localhost:27017/k9db?authSource=admin

# MongoDB データベース・コレクション名
MONGO_DB=k9db
MONGO_COLLECTION=api_keys
MONGO_LOGS_COLLECTION=completion_logs

# wrapper が使う llama.cpp の URL (デフォルトのバックエンド)
LLAMA_CPP_URL=http://localhost:8080

# 管理用マスターキー (APIキー発行などに使用)
MASTER_KEY=your-secret-master-key-here
EOF
```

---

## ステップ 3: モデルファイルを確認 / Verify model files

この例で使うモデルファイルの配置を確認する。

```bash
# 期待するディレクトリ構成 / Expected layout
ls $HOME/gguf_models/unsloth/Qwen3.5-4B-GGUF/
# → Qwen3.5-4B-UD-Q4_K_XL.gguf

ls $HOME/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/
# → gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
# → mmproj-BF16.gguf
```

```
~/gguf_models/                         ← MODELS_DIR に設定するディレクトリ
└── unsloth/
    ├── Qwen3.5-4B-GGUF/
    │   └── Qwen3.5-4B-UD-Q4_K_XL.gguf
    └── gemma-4-26B-A4B-it-GGUF/
        ├── gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        └── mmproj-BF16.gguf
```

---

## ステップ 4: 設定ファイルを準備 / Prepare config files

リポジトリに用意した例をコピーして使う。

```bash
# 例ファイルをコピー / Copy example files
cp beta-test/docker/examples/supervisord.conf  beta-test/docker/supervisord.conf
cp beta-test/docker/examples/backends.docker.yaml beta-test/docker/backends.docker.yaml
```

### supervisord.conf の内容（コピー済み）

`beta-test/docker/supervisord.conf` には以下の3プロセスが定義される。

| プロセス名 | モデル | ポート | 機能 |
|-----------|--------|--------|------|
| `llm-qwen4b` | Qwen3.5-4B | 8081 | テキスト生成 |
| `llm-gemma26b` | Gemma-4-26B + mmproj | 8082 | テキスト + 画像認識 |
| `wrapper` | Bun/Hono プロキシ | 3085 (外部公開) | 認証・ルーティング |

**supervisord.conf が Docker にどう読まれるか / How Docker reads supervisord.conf**

`docker-compose.yml` でホスト側ファイルをコンテナ内にマウントしている。

```yaml
# docker-compose.yml (抜粋)
volumes:
  - ./supervisord.conf:/app/beta-test/docker/supervisord.conf:ro
```

コンテナ起動時に `start.sh` → `supervisord -c /app/beta-test/docker/supervisord.conf` という流れで読み込まれる。  
ファイルを編集→ `supervisorctl reread && update` だけでリビルドなしにプロセスを追加・変更できる。

### backends.docker.yaml の内容（コピー済み）

wrapper がリクエストをどのポートに転送するかを定義する。  
`supervisord.conf` の `LLAMA_PORT` と対になっている。

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081   # llm-qwen4b のポートと一致
    pathPrefix: /qwen3.5-4b

  - name: gemma-4-26b
    url: http://localhost:8082   # llm-gemma26b のポートと一致
    pathPrefix: /gemma-4-26b
```

---

## ステップ 5: イメージをビルド / Build the image

llama.cpp の CUDA コンパイルを含むため**15〜30分**かかる。  
モデルファイルは含まれない（起動時にマウントされる）。

```bash
export MODELS_DIR=$HOME/gguf_models

docker compose -f beta-test/docker/docker-compose.yml build
```

GPU アーキテクチャが RTX 5070 Ti 以外の場合:

| GPU | CUDA_ARCH | コマンド例 |
|-----|-----------|----------|
| RTX 5070 Ti (Blackwell) | 120 | デフォルト (`build` のみ) |
| RTX 4090 (Ada) | 89 | `CUDA_ARCH=89 docker compose ... build` |
| RTX 3090 (Ampere) | 86 | `CUDA_ARCH=86 docker compose ... build` |

---

## ステップ 6: コンテナを起動 / Start the container

```bash
export MODELS_DIR=$HOME/gguf_models

# バックグラウンドで起動 / Start in background
docker compose -f beta-test/docker/docker-compose.yml up -d
```

---

## ステップ 7: 起動確認 / Verify startup

3プロセス全てが `RUNNING` になるまで待つ（モデルサイズによって1〜3分かかる）。

```bash
# プロセス状態確認 / Check process status
docker exec rewrite-wrapper-beta supervisorctl status
```

期待される出力:
```
llm-gemma26b             RUNNING   pid 34, uptime 0:01:23
llm-qwen4b               RUNNING   pid 35, uptime 0:01:23
wrapper                  RUNNING   pid 36, uptime 0:01:23
```

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
    {"name": "qwen3.5-4b",  "url": "http://localhost:8081", "pathPrefix": "/qwen3.5-4b"},
    {"name": "gemma-4-26b", "url": "http://localhost:8082", "pathPrefix": "/gemma-4-26b"}
  ]
}
```

---

## ステップ 8: 推論テスト / Test inference

### Qwen3.5-4B — テキスト生成

```bash
curl -s http://localhost:3085/qwen3.5-4b/v1/chat/completions \
  -H "Authorization: Bearer <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-4b",
    "messages": [{"role": "user", "content": "日本語で自己紹介してください。"}],
    "stream": false
  }' | jq .choices[0].message.content
```

### Gemma-4-26B — 画像認識

```bash
# 画像を Base64 エンコード / Encode image to base64
IMAGE_B64=$(base64 -w0 /path/to/your/image.jpg)

curl -s http://localhost:3085/gemma-4-26b/v1/chat/completions \
  -H "Authorization: Bearer <your_api_key>" \
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

## モデルの追加・変更 (リビルド不要) / Add / change models (no rebuild)

### モデルを追加する / Add a model

1. `beta-test/docker/supervisord.conf` に `[program:llm-newmodel]` を追記
2. `beta-test/docker/backends.docker.yaml` に対応エントリを追記
3. コンテナに反映:

```bash
docker exec rewrite-wrapper-beta supervisorctl reread
docker exec rewrite-wrapper-beta supervisorctl update
docker exec rewrite-wrapper-beta supervisorctl restart wrapper
```

### モデルを一時停止する / Stop a model

```bash
docker exec rewrite-wrapper-beta supervisorctl stop llm-gemma26b
```

### ログを確認する / Check logs

```bash
docker exec rewrite-wrapper-beta tail -f /app/logs/llm-gemma26b.log
docker exec rewrite-wrapper-beta tail -f /app/logs/llm-qwen4b.log
docker exec rewrite-wrapper-beta tail -f /app/logs/wrapper.log
```

---

## VRAM 使用量の目安 / Approximate VRAM usage

| モデル | VRAM |
|--------|------|
| Qwen3.5-4B (Q4_K_XL) | 約 2.8 GB |
| Gemma-4-26B (Q4_K_XL) + mmproj-BF16 | 約 13 GB |
| **合計 / Total** | **約 15.8 GB** |

RTX 5070 Ti (16 GB) の場合ギリギリ収まる。  
VRAM が不足する場合は `N_GPU_LAYERS` を下げて一部レイヤーを CPU に退避させる。

```ini
; VRAM 不足時は N_GPU_LAYERS を調整 / Reduce if VRAM is insufficient
environment=...,N_GPU_LAYERS="20"   ; -1 (全層) → 数値で上限指定
```

```bash
# VRAM 使用量確認 / Check VRAM usage
docker exec rewrite-wrapper-beta nvidia-smi
```

---

## ファイル構成まとめ / File layout summary

```
beta-test/docker/
├── Dockerfile.beta          # イメージ定義 (llama.cpp CUDA ビルド含む)
├── docker-compose.yml       # コンテナ起動設定
├── supervisord.conf         # ← ここを編集してモデルを追加・変更する
├── backends.docker.yaml     # ← ここを編集してルーティングを変える
├── scripts/
│   ├── start.sh             # コンテナ起動スクリプト
│   └── llama-entrypoint.sh  # llama-server 起動スクリプト (MMPROJ_FILE対応)
├── examples/
│   ├── supervisord.conf     # この例で使った設定ファイル (コピー元)
│   └── backends.docker.yaml # この例で使った設定ファイル (コピー元)
├── examples.md              # このファイル
└── how_to_use.md            # 詳細リファレンス
```
