# β テスト環境 / Beta Test Environment

複数の llama.cpp バックエンド (4B・0.8B) をプロキシサーバー経由でテストするための環境。

## ポート割り当て / Port Assignment

| サービス | ポート | 役割 |
|---------|--------|------|
| `rewrite-wrapper` (Bun) | **3000** | プロキシサーバー |
| `qwen3.5-4b` (llama.cpp) | **8081** | 4B モデル |
| `qwen3.5-0.8b` (llama.cpp) | **8082** | 0.8B モデル |

## ルーティング / Routing

```
POST /qwen3.5-4b/v1/chat/completions   → port 8081
POST /qwen3.5-0.8b/v1/chat/completions → port 8082
```

---

## 前提条件 / Prerequisites

| 必要なもの | 確認コマンド |
|-----------|------------|
| llama.cpp ビルド済み | `~/llama.cpp/build/bin/llama-server --version` |
| 4B モデル | `ls ~/gguf_models/Qwen3.5-4B-GGUF/` |
| 0.8B モデル | `ls ~/gguf_models/Qwen3.5-0.8B-GGUF/` |
| Bun インストール済み | `bun --version` |
| MongoDB 稼働中 | `mongosh --eval "db.adminCommand('ping')"` |
| `.env` 設定済み | プロジェクトルートの `.env` を確認 |

---

## 起動手順 / Startup

### 一括起動（推奨） / Recommended: Start All

```bash
# プロジェクトルートから実行 / Run from project root
bash beta-test/start-all.sh
```

以下の順番で起動します:
1. Qwen3.5-4B → port 8081 (ヘルスチェック通過まで待機)
2. Qwen3.5-0.8B → port 8082 (同上)
3. ラッパーサーバー → port 3000

### 個別起動 / Individual Startup

```bash
# 各サーバーを個別に起動
bash beta-test/servers/start-4b.sh
bash beta-test/servers/start-0.8b.sh
bash beta-test/servers/start-wrapper.sh
```

### 起動確認 / Verify Startup

```bash
# ヘルスチェック (バックエンド名一覧が返る)
curl http://localhost:3000/health

# バックエンド設定確認
curl http://localhost:3000/backends
```

---

## テスト実行 / Running Tests

### ブラウザ UI / Browser UI

サーバー起動後、ブラウザでアクセス:

```
http://localhost:3000/beta-test
```

機能:
- バックエンド自動検出 (`/backends` から取得)
- ストリーム / ノンストリーム切り替え
- APIキーの localStorage 保存
- レイテンシ・文字数表示
- エラー詳細表示

### curl テスト / Curl Tests

```bash
# 全テストを一括実行 (APIキー発行 → 各テスト)
bash beta-test/curl/run-all.sh

# 個別実行
bash beta-test/curl/00-setup.sh         # APIキー発行 → .api_key に保存
bash beta-test/curl/01-test-4b.sh       # 4B ストリームテスト
bash beta-test/curl/02-test-0.8b.sh     # 0.8B ストリームテスト
bash beta-test/curl/03-test-nostream.sh # ノンストリームテスト
bash beta-test/curl/04-test-errors.sh   # エラーレスポンステスト
```

環境変数でカスタマイズ:
```bash
WRAPPER_URL=http://localhost:3000 \
MASTER_KEY=your-master-key \
bash beta-test/curl/run-all.sh
```

---

## 停止 / Shutdown

```bash
bash beta-test/stop-all.sh
```

---

## ログ確認 / Logs

```bash
tail -f /tmp/llamacpp-4b.log    # 4B ログ
tail -f /tmp/llamacpp-0.8b.log  # 0.8B ログ
tail -f /tmp/wrapper.log        # ラッパーログ
```

---

## バックエンド設定変更 / Change Backend Config

プロジェクトルートの `backends.yaml` を編集してサーバーを再起動:

```yaml
backends:
  - name: qwen3.5-4b
    url: http://localhost:8081
    pathPrefix: /qwen3.5-4b
    description: Qwen3.5-4B (UD-Q4_K_XL)

  - name: qwen3.5-0.8b
    url: http://localhost:8082
    pathPrefix: /qwen3.5-0.8b
    description: Qwen3.5-0.8B (UD-Q4_K_XL)
```

追加したバックエンドは `/backends` エンドポイントと UI の Backend セレクタに自動反映されます。
