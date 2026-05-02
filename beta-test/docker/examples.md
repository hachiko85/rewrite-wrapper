# β テスト Docker — 実装例 / Implementation Examples

具体的なモデル構成と設定手順の実例集。  
Concrete model configurations and step-by-step setup examples.

> **前提**: `beta-test/docker/how_to_use.md` の初回セットアップ (イメージビルド) が完了していること。  
> **Prerequisite**: Initial image build in `how_to_use.md` must be completed first.

---

## 例1: Qwen3.5-4B (テキストのみ) / Example 1: Qwen3.5-4B (text-only)

```
ホスト側ファイル / Host file:
  ~/gguf_models/unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf
```

### supervisord.conf

```ini
[program:llm-qwen4b]
command=bash /app/beta-test/docker/scripts/llama-entrypoint.sh
environment=MODEL_FILE="unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf",LLAMA_PORT="8081",N_PARALLEL="4",CTX_SIZE="8192",N_GPU_LAYERS="-1",N_PREDICT="512",LD_LIBRARY_PATH="/opt/llama/bin"
autostart=true
autorestart=true
startretries=3
startsecs=5
stdout_logfile=/app/logs/llm-qwen4b.log
stdout_logfile_maxbytes=20MB
stdout_logfile_backups=2
stderr_logfile=/app/logs/llm-qwen4b.log
stderr_logfile_maxbytes=0
```

> **ポイント / Note**: `MODEL_FILE` は `MODELS_DIR` (`~/gguf_models`) からの相対パス。  
> `unsloth/Qwen3.5-4B-GGUF/...` と書くだけでサブディレクトリ対応。

### backends.docker.yaml

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081
    pathPrefix: /qwen3.5-4b
    description: Qwen3.5-4B (unsloth UD-Q4_K_XL) — text only
```

### 起動・確認 / Start & Verify

```bash
# 初回ビルド (未実施の場合) / Initial build (if not done yet)
export MODELS_DIR=$HOME/gguf_models
docker compose -f beta-test/docker/docker-compose.yml build

# 起動 / Start
docker compose -f beta-test/docker/docker-compose.yml up -d

# プロセス確認 / Check processes
docker exec rewrite-wrapper-beta supervisorctl status

# 動作確認 / Verify
curl http://localhost:3085/health
curl -s http://localhost:3085/backends | jq .

# 推論テスト / Inference test
curl -s http://localhost:3085/qwen3.5-4b/v1/chat/completions \
  -H "Authorization: Bearer <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-4b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }' | jq .
```

---

## 例2: Gemma-4-26B (画像認識 / Vision) / Example 2: Gemma-4-26B with mmproj

```
ホスト側ファイル / Host files:
  ~/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
  ~/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf
```

### supervisord.conf

```ini
[program:llm-gemma26b]
command=bash /app/beta-test/docker/scripts/llama-entrypoint.sh
environment=MODEL_FILE="unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",MMPROJ_FILE="unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf",LLAMA_PORT="8082",N_PARALLEL="2",CTX_SIZE="8192",N_GPU_LAYERS="-1",N_PREDICT="512",LD_LIBRARY_PATH="/opt/llama/bin"
autostart=true
autorestart=true
startretries=3
startsecs=10
stdout_logfile=/app/logs/llm-gemma26b.log
stdout_logfile_maxbytes=20MB
stdout_logfile_backups=2
stderr_logfile=/app/logs/llm-gemma26b.log
stderr_logfile_maxbytes=0
```

> **ポイント / Notes**:
> - `MMPROJ_FILE` を設定するだけで `--mmproj` フラグが自動付与される。  
>   Setting `MMPROJ_FILE` automatically adds the `--mmproj` flag to llama-server.
> - 26B モデルは VRAM 使用量が大きいため `N_PARALLEL="2"` に抑えている。  
>   26B model consumes more VRAM, so `N_PARALLEL` is reduced to 2.
> - モデルと mmproj は**同じディレクトリに置く**のが管理しやすい。  
>   Keeping model and mmproj in the same directory simplifies management.

### backends.docker.yaml

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081
    pathPrefix: /qwen3.5-4b
    description: Qwen3.5-4B (unsloth UD-Q4_K_XL) — text only

  - name: gemma-4-26b
    url: http://localhost:8082
    pathPrefix: /gemma-4-26b
    description: Gemma-4-26B (unsloth UD-Q4_K_XL) — vision enabled
```

### 設定反映 (リビルド不要) / Apply config (no rebuild)

`supervisord.conf` と `backends.docker.yaml` を編集した後:

```bash
# 設定再読み込み / Reload config
docker exec rewrite-wrapper-beta supervisorctl reread
docker exec rewrite-wrapper-beta supervisorctl update

# 新プロセス確認 / Check new process
docker exec rewrite-wrapper-beta supervisorctl status

# wrapper を再起動してバックエンド一覧を更新 / Restart wrapper to refresh backends
docker exec rewrite-wrapper-beta supervisorctl restart wrapper
```

### 起動ログ確認 / Check startup logs

```bash
# mmproj が正しく読み込まれているか確認 / Verify mmproj is loaded
docker exec rewrite-wrapper-beta tail -30 /app/logs/llm-gemma26b.log
```

正常時のログ出力例 / Expected log output:
```
================================================
 llama-server エントリーポイント / Entrypoint
  Model     : /models/unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
  Port      : 8082
  Slots     : 2
  Mmproj    : /models/unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf
================================================
```

### 画像推論テスト / Vision inference test

```bash
# Base64エンコードした画像を含むリクエスト / Request with Base64-encoded image
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
  }" | jq .
```

---

## 両モデル同時稼働の構成全体 / Full config: both models running together

### ディレクトリ構成 / Directory layout

```
~/gguf_models/
└── unsloth/
    ├── Qwen3.5-4B-GGUF/
    │   └── Qwen3.5-4B-UD-Q4_K_XL.gguf
    └── gemma-4-26B-A4B-it-GGUF/
        ├── gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        └── mmproj-BF16.gguf
```

### supervisord.conf (完全版) / (complete)

```ini
[supervisord]
nodaemon=true
user=root
logfile=/app/logs/supervisord.log
logfile_maxbytes=10MB
logfile_backups=3
loglevel=info

[unix_http_server]
file=/var/run/supervisor.sock
chmod=0700

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[program:llm-qwen4b]
command=bash /app/beta-test/docker/scripts/llama-entrypoint.sh
environment=MODEL_FILE="unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-UD-Q4_K_XL.gguf",LLAMA_PORT="8081",N_PARALLEL="4",CTX_SIZE="8192",N_GPU_LAYERS="-1",N_PREDICT="512",LD_LIBRARY_PATH="/opt/llama/bin"
autostart=true
autorestart=true
startretries=3
startsecs=5
stdout_logfile=/app/logs/llm-qwen4b.log
stdout_logfile_maxbytes=20MB
stdout_logfile_backups=2
stderr_logfile=/app/logs/llm-qwen4b.log
stderr_logfile_maxbytes=0

[program:llm-gemma26b]
command=bash /app/beta-test/docker/scripts/llama-entrypoint.sh
environment=MODEL_FILE="unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",MMPROJ_FILE="unsloth/gemma-4-26B-A4B-it-GGUF/mmproj-BF16.gguf",LLAMA_PORT="8082",N_PARALLEL="2",CTX_SIZE="8192",N_GPU_LAYERS="-1",N_PREDICT="512",LD_LIBRARY_PATH="/opt/llama/bin"
autostart=true
autorestart=true
startretries=3
startsecs=10
stdout_logfile=/app/logs/llm-gemma26b.log
stdout_logfile_maxbytes=20MB
stdout_logfile_backups=2
stderr_logfile=/app/logs/llm-gemma26b.log
stderr_logfile_maxbytes=0

[program:wrapper]
command=bun run start
directory=/app
environment=MONGO_URI="%(ENV_MONGO_URI)s",MASTER_KEY="%(ENV_MASTER_KEY)s",BACKENDS_CONFIG="%(ENV_BACKENDS_CONFIG)s",PORT="%(ENV_PORT)s"
autostart=true
autorestart=true
startretries=5
startsecs=15
stdout_logfile=/app/logs/wrapper.log
stdout_logfile_maxbytes=20MB
stdout_logfile_backups=2
stderr_logfile=/app/logs/wrapper.log
stderr_logfile_maxbytes=0
```

### backends.docker.yaml (完全版) / (complete)

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081
    pathPrefix: /qwen3.5-4b
    description: Qwen3.5-4B (unsloth UD-Q4_K_XL) — text only

  - name: gemma-4-26b
    url: http://localhost:8082
    pathPrefix: /gemma-4-26b
    description: Gemma-4-26B (unsloth UD-Q4_K_XL) — vision enabled
```

### ビルドから起動まで / Build to launch

```bash
# 1. モデルディレクトリを確認 / Check model directory
ls ~/gguf_models/unsloth/Qwen3.5-4B-GGUF/
ls ~/gguf_models/unsloth/gemma-4-26B-A4B-it-GGUF/

# 2. supervisord.conf と backends.docker.yaml を上記の内容に更新
#    Update supervisord.conf and backends.docker.yaml as shown above

# 3. イメージビルド (初回または Dockerfile 変更時のみ)
#    Build image (only on first time or Dockerfile change)
export MODELS_DIR=$HOME/gguf_models
docker compose -f beta-test/docker/docker-compose.yml build

# 4. 起動 / Start
docker compose -f beta-test/docker/docker-compose.yml up -d

# 5. 全プロセス確認 / Check all processes
docker exec rewrite-wrapper-beta supervisorctl status
# 期待される出力 / Expected output:
#   llm-gemma26b    RUNNING   pid ...
#   llm-qwen4b      RUNNING   pid ...
#   wrapper         RUNNING   pid ...

# 6. エンドポイント確認 / Verify endpoints
curl http://localhost:3085/health
curl -s http://localhost:3085/backends | jq .
```

---

## MODELS_DIR の使い方まとめ / MODELS_DIR path mapping

`MODELS_DIR` はコンテナ内の `/models` にマウントされる。  
`MODEL_FILE` / `MMPROJ_FILE` は `/models/` からの**相対パス**で指定する。

| ホストのファイルパス | MODELS_DIR | MODEL_FILE |
|---------------------|-----------|------------|
| `~/gguf_models/unsloth/Model.gguf` | `$HOME/gguf_models` | `"unsloth/Model.gguf"` |
| `~/gguf_models/unsloth/Model.gguf` | `$HOME/gguf_models/unsloth` | `"Model.gguf"` |
| `~/models/Model.gguf` | `$HOME/models` | `"Model.gguf"` |

どちらの `MODELS_DIR` でも動作する。モデルが複数ディレクトリにまたがる場合は上位ディレクトリを `MODELS_DIR` に設定するのが便利。

---

## トラブルシューティング / Troubleshooting

```bash
# モデルが見つからない場合 / Model not found
docker exec rewrite-wrapper-beta ls /models/unsloth/

# mmproj が見つからない場合 / mmproj not found
docker exec rewrite-wrapper-beta ls /models/unsloth/gemma-4-26B-A4B-it-GGUF/

# プロセスが FATAL になった場合 / Process is FATAL
docker exec rewrite-wrapper-beta tail -50 /app/logs/llm-gemma26b.log

# GPU メモリ確認 / Check GPU memory
docker exec rewrite-wrapper-beta nvidia-smi
```
