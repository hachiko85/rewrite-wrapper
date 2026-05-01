# Docker 使い方ガイド / Docker Usage Guide

## 目次 / Table of Contents

1. [前提条件 / Prerequisites](#前提条件--prerequisites)
2. [初回セットアップ / Initial Setup](#初回セットアップ--initial-setup)
3. [対話モード / Interactive Mode](#対話モード--interactive-mode)
4. [本番起動 / Production Startup](#本番起動--production-startup)
5. [ボリュームマウント / Volume Mounts](#ボリュームマウント--volume-mounts)
6. [よく使うコマンド / Common Commands](#よく使うコマンド--common-commands)
7. [トラブルシューティング / Troubleshooting](#トラブルシューティング--troubleshooting)

---

## 前提条件 / Prerequisites

### ホスト側に必要なもの / Required on host

| 必要なもの | 確認コマンド |
|-----------|------------|
| Docker Engine 24+ | `docker --version` |
| Docker Compose v2 | `docker compose version` |
| nvidia-container-toolkit | `nvidia-ctk --version` |
| NVIDIA GPU ドライバー | `nvidia-smi` |

### nvidia-container-toolkit の確認

```bash
# GPU が Docker から見えるか確認
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

正常に GPU 情報が表示されれば OK です。

---

## 初回セットアップ / Initial Setup

### 1. 環境変数ファイルの準備

```bash
cd /path/to/rewrite-wrapper

# テンプレートをコピー
cp docker/.env.example .env

# 値を編集 (必須: MODELS_DIR, MASTER_KEY)
nano .env
```

最低限設定が必要な項目:

```env
# ホスト側のモデルディレクトリ (gguf ファイルがある場所)
MODELS_DIR=/home/user/gguf_models

# 管理APIキー (推測困難な文字列に変更)
MASTER_KEY=your-secret-key-here

# コンテナ内 /models 以下のモデルファイルパス
MODEL_FILE=Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf
```

### 2. イメージのビルド

```bash
cd docker

# ビルド (初回は llama.cpp のコンパイルで 10〜20 分かかります)
docker compose build

# ビルドログを詳細表示したい場合
docker compose build --progress=plain
```

ビルド完了後の確認:

```bash
docker images | grep rewrite-wrapper
# rewrite-wrapper   latest   xxxxxxxxxxxx   X minutes ago   ~8GB
```

> **NOTE**: llama.cpp と CUDA devel ベースイメージを含むため、最終イメージは 8〜10GB になります。

---

## 対話モード / Interactive Mode

コンテナ内に入って手動で操作したい場合に使います。  
環境の確認、モデルのテスト、設定の調整などに使用してください。

### コンテナに入る

```bash
cd docker

# 対話モードでコンテナを起動してシェルに入る
# Start container in interactive mode and enter shell
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm wrapper
```

または既にコンテナが起動している場合:

```bash
# 起動中のコンテナに入る / Enter running container
docker exec -it rewrite-wrapper bash
```

### コンテナ内でできること / Inside the container

**GPU 確認:**
```bash
nvidia-smi
```

**モデルファイル確認:**
```bash
find /models -name "*.gguf"
# /models/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf
```

**llama.cpp 手動起動 (フォアグラウンド):**
```bash
bash /app/docker/scripts/llama-cpp-run.sh
```

**llama.cpp バックグラウンド起動:**
```bash
bash /app/docker/scripts/llama-cpp-run.sh --background

# ヘルスチェック
curl http://localhost:8080/health

# ログ確認
tail -f /app/logs/llamacpp.log
```

**ラッパーサーバー手動起動 (llama.cpp 起動後に別ターミナルで):**
```bash
cd /app && bun run start
```

**APIキー発行:**
```bash
curl -s -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: $MASTER_KEY" \
  -d '{"name": "test-client"}'
```

**動作確認:**
```bash
API_KEY="sk-xxxx"

curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"こんにちは"}],"stream":true,"n_predict":100}'
```

---

## 本番起動 / Production Startup

llama.cpp とラッパーサーバーが自動的に順番に起動します。

### 起動

```bash
cd docker

# フォアグラウンド (ログをリアルタイム表示)
docker compose up

# バックグラウンド
docker compose up -d
```

起動ログの例:

```
rewrite-wrapper  | ================================================
rewrite-wrapper  |  rewrite-wrapper 起動シーケンス
rewrite-wrapper  | ================================================
rewrite-wrapper  | [GPU] nvidia-smi: NVIDIA GeForce RTX 3080, 10240 MiB
rewrite-wrapper  | [1/3] llama.cpp サーバーを起動中...
rewrite-wrapper  |   Model     : /models/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf
rewrite-wrapper  |   Slots     : 4
rewrite-wrapper  | [2/3] llama.cpp の起動を待機中...
rewrite-wrapper  |   起動完了 (23s elapsed)
rewrite-wrapper  | [3/3] ラッパーサーバーを起動中...
rewrite-wrapper  | [MongoDB] Connected to database: k9db
rewrite-wrapper  | [Server] Listening on http://localhost:3000
```

### ヘルスチェック

```bash
curl http://localhost:3000/health
# {"status":"ok","upstream":"http://localhost:8080","timestamp":"..."}
```

### 停止

```bash
docker compose down          # コンテナ停止・削除 (データは保持)
docker compose down -v       # ボリュームも削除 (MongoDB データが消えます)
```

### ログ確認

```bash
docker compose logs -f             # 全サービスのログ
docker compose logs -f wrapper     # ラッパーのみ
docker compose logs -f mongodb     # MongoDB のみ

# llama.cpp ログ (コンテナ内)
docker exec rewrite-wrapper tail -f /app/logs/llamacpp.log
```

---

## ボリュームマウント / Volume Mounts

### デフォルトのマウント構成

| ホストパス | コンテナパス | 用途 |
|-----------|------------|------|
| `$MODELS_DIR` | `/models` (読み取り専用) | GGUF モデルファイル |
| Docker Volume `wrapper-logs` | `/app/logs` | llama.cpp・サーバーログ |
| Docker Volume `mongodb-data` | `/data/db` | MongoDB データ |

対話モード追加マウント:

| ホストパス | コンテナパス | 用途 |
|-----------|------------|------|
| `../apps` | `/app/apps` | ソースコード (ライブ編集) |
| `../shared` | `/app/shared` | 共有型定義 |
| `../.env` | `/app/.env` | 環境変数ファイル |

### MODELS_DIR の変更

`.env` で `MODELS_DIR` を変更するか、コマンドラインで指定します:

```bash
MODELS_DIR=/data/models docker compose up
```

### 複数モデルの切り替え

```bash
# .env の MODEL_FILE を変更して再起動
MODEL_FILE=Llama-3-8B-GGUF/llama3-8b-q4.gguf docker compose up
```

---

## よく使うコマンド / Common Commands

```bash
# ── ビルド / Build ──────────────────────────
# イメージビルド
docker compose build

# キャッシュなしで再ビルド (llama.cpp 更新時など)
docker compose build --no-cache

# ── 起動 / Start ────────────────────────────
# 本番起動 (バックグラウンド)
docker compose up -d

# 対話モード
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm wrapper

# ── 操作 / Operate ──────────────────────────
# 起動中コンテナにシェルで入る
docker exec -it rewrite-wrapper bash

# ラッパーのログをリアルタイム表示
docker compose logs -f wrapper

# llama.cpp ログ確認
docker exec rewrite-wrapper tail -f /app/logs/llamacpp.log

# GPU 使用状況
docker exec rewrite-wrapper nvidia-smi

# ── 停止 / Stop ─────────────────────────────
# 停止 (データ保持)
docker compose down

# 完全削除 (MongoDB データも削除)
docker compose down -v --rmi local
```

---

## トラブルシューティング / Troubleshooting

### GPU が認識されない

```bash
# ホストで確認
nvidia-smi

# Docker から GPU が見えるか確認
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

# nvidia-container-toolkit の再設定
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### モデルファイルが見つからない (MODELS_DIR)

```bash
# コンテナ内で確認
docker exec rewrite-wrapper find /models -name "*.gguf"

# MODELS_DIR が正しく設定されているか確認
grep MODELS_DIR .env
```

### MongoDB に接続できない

```bash
# コンテナが起動しているか確認
docker compose ps

# MongoDB ログ確認
docker compose logs mongodb

# コンテナ内から接続テスト
docker exec rewrite-wrapper mongosh "mongodb://mongodb:27017/k9db" --eval "db.adminCommand('ping')"
```

### ビルドに失敗する (llama.cpp コンパイルエラー)

```bash
# 詳細ログを表示してビルド
docker compose build --no-cache --progress=plain 2>&1 | tee /tmp/build.log

# 特定の llama.cpp バージョンを指定
docker compose build --build-arg LLAMA_CPP_REF=b5456
```

### イメージサイズについて

llama.cpp (CUDA devel) を含むため最終イメージは **8〜10GB** になります。  
容量を節約したい場合は `Dockerfile` の Stage 2 を `nvidia/cuda:12.4.1-runtime-ubuntu22.04` に変更し、必要な `.so` ファイルを手動でコピーする最適化が可能です。
