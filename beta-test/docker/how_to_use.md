# β テスト Docker 環境 / Beta-Test Docker Environment

**単一コンテナ**で llm-4b・llm-0-8b・wrapper の3プロセスを `supervisord` で管理する構成。  
llama.cpp は **コンテナ内で CUDA 付きフルビルド**される。ホスト側バイナリ不要。  
MongoDB はホスト側の既存インスタンスに直接接続 (`network_mode: host`)。

## アーキテクチャ / Architecture

```
ホスト:3085 (外部公開)
    ↓
[ 単一コンテナ — network_mode: host ]
  ├── wrapper (Bun/Hono)    :3085  ← ホストに直接公開
  ├── llm-4b  (llama-server) :8081  ← コンテナ内部のみ
  └── llm-0-8b (llama-server) :8082  ← コンテナ内部のみ
  supervisord が3プロセスを管理

ホスト:27017 (MongoDB) ← network_mode:host で直接接続

llama.cpp バイナリ: コンテナ内 /opt/llama/bin/ (Dockerビルド時にCUDAコンパイル)
```

---

## 設計方針 / Design Notes

| 項目 | 採用方針 | 理由 |
|------|---------|------|
| llama.cpp | **コンテナ内でフルビルド** (CUDA 13.0) | どの環境でも `docker build` 一発で再現可能 |
| CUDAアーキテクチャ | ビルド引数 `CUDA_ARCH` で指定 | Blackwell (120) / Ada (89) / Ampere (86) に対応 |
| MongoDB | ホストの既存インスタンスに接続 | コンテナ追加不要、既存の認証・データを利用 |
| ネットワーク | `network_mode: host` | コンテナ内から`localhost:27017`に直接接続するため |
| プロセス管理 | `supervisord` | 1コンテナ複数プロセスの定番ツール |

---

## 前提条件 / Prerequisites

| 必要なもの | 確認コマンド |
|-----------|-------------|
| Docker Engine 24+ | `docker --version` |
| Docker Compose v2+ | `docker compose version` |
| NVIDIA Container Toolkit | `docker run --rm --gpus all ubuntu nvidia-smi` |
| GGUFモデルファイル | `ls $HOME/gguf_models/` |
| MongoDB 稼働中 | `mongosh --eval "db.adminCommand('ping')"` |
| `.env` 設定済み | プロジェクトルートの `.env` に `MONGO_URI`, `MASTER_KEY` が必要 |

> **Note**: ホスト側に llama.cpp のビルド済みバイナリは**不要**。  
> Docker ビルド時にコンテナ内でコンパイルされる。

---

## 初回セットアップ / Initial Setup

```bash
# プロジェクトルートから実行 / Run from project root
export MODELS_DIR=$HOME/gguf_models

# イメージビルド (llama.cpp CUDA ビルドを含む、約15〜30分)
# Build image (includes llama.cpp CUDA build, ~15-30 minutes)
docker compose -f beta-test/docker/docker-compose.yml build

# RTX 4090 (Ada) など別GPUの場合 / For other GPUs (e.g. RTX 4090 Ada):
# CUDA_ARCH=89 docker compose -f beta-test/docker/docker-compose.yml build
```

---

## 起動 / Start

```bash
export MODELS_DIR=$HOME/gguf_models

# バックグラウンド起動 / Background
docker compose -f beta-test/docker/docker-compose.yml up -d

# フォアグラウンド (ログ表示) / Foreground with logs
docker compose -f beta-test/docker/docker-compose.yml up
```

---

## 動作確認 / Verify

```bash
# ヘルスチェック / Health check (ポートは3085)
curl http://localhost:3085/health

# バックエンド一覧
curl http://localhost:3085/backends

# ブラウザUI
open http://localhost:3085/beta-test
```

---

## プロセス操作 / Process Control (ビルド不要)

```bash
# 全プロセス状態確認
docker exec rewrite-wrapper-beta supervisorctl status

# 個別プロセス操作
docker exec rewrite-wrapper-beta supervisorctl stop    llm-4b
docker exec rewrite-wrapper-beta supervisorctl start   llm-4b
docker exec rewrite-wrapper-beta supervisorctl restart wrapper

# ログ確認
docker exec rewrite-wrapper-beta tail -f /app/logs/wrapper.log
docker exec rewrite-wrapper-beta tail -f /app/logs/llm-4b.log
docker exec rewrite-wrapper-beta tail -f /app/logs/llm-0-8b.log
```

---

## モデル追加 / Add a Model (ビルド不要)

### 1. `supervisord.conf` に新プロセスを追記

```ini
[program:llm-newmodel]
command=/app/beta-test/docker/scripts/llama-entrypoint.sh
environment=MODEL_FILE="NewModel-GGUF/NewModel.gguf",LLAMA_PORT="8083",N_PARALLEL="4",CTX_SIZE="8192",N_GPU_LAYERS="-1",N_PREDICT="512",LD_LIBRARY_PATH="/opt/llama/bin"
autostart=true
autorestart=true
startretries=3
startsecs=5
stdout_logfile=/app/logs/llm-newmodel.log
stderr_logfile=/app/logs/llm-newmodel.log
stdout_logfile_maxbytes=20MB
stderr_logfile_maxbytes=0
```

### 2. `backends.docker.yaml` に対応エントリを追記

```yaml
  - name: newmodel
    url: http://localhost:8083
    pathPrefix: /newmodel
    description: New Model
```

### 3. コンテナに設定を反映

```bash
docker exec rewrite-wrapper-beta supervisorctl reread
docker exec rewrite-wrapper-beta supervisorctl update
docker exec rewrite-wrapper-beta supervisorctl restart wrapper
```

---

## モデル削除 / Remove a Model (ビルド不要)

```bash
# プロセスを停止
docker exec rewrite-wrapper-beta supervisorctl stop llm-4b

# supervisord.conf から [program:llm-4b] セクションを削除
# backends.docker.yaml から対応エントリを削除

# 設定を反映
docker exec rewrite-wrapper-beta supervisorctl reread
docker exec rewrite-wrapper-beta supervisorctl update
docker exec rewrite-wrapper-beta supervisorctl restart wrapper
```

---

## 停止 / Stop

```bash
docker compose -f beta-test/docker/docker-compose.yml down
```

---

## 環境変数カスタマイズ / Environment Variable Overrides

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `MODELS_DIR` | `/tmp/models` | モデルファイルディレクトリ |
| `WRAPPER_PORT` | `3085` | ラッパーサーバーのホスト公開ポート |
| `CUDA_ARCH` | `120` | CUDAアーキテクチャ (ビルド時のみ) |

---

## コンテナ内に入る / Enter Container

```bash
docker exec -it rewrite-wrapper-beta bash
```

---

## NVIDIA Container Toolkit セットアップ / NVIDIA Container Toolkit Setup

```bash
# リポジトリを追加 / Add repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# インストール / Install
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# Docker に設定を適用 / Configure Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 動作確認 / Verify
docker run --rm --gpus all ubuntu nvidia-smi
```
