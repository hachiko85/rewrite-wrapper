# manage_server.md — サーバー作業履歴

## 2026-04-30 — PHASE 1: 基盤構築

### 概要
rewrite-wrapper プロジェクトの初期セットアップ。Bun + Hono + MongoDB の構成でLLMプロキシサーバーの基盤を構築。

### 実施内容
- [x] CLAUDE.md 読み込み・理解
- [x] 実装戦略の提案・承認 (Planモード)
- [x] ディレクトリ構造作成
- [x] Bun インストール (npm経由, v1.3.13 ※unzip未インストール環境のためnpm経由)
- [x] 依存パッケージインストール: hono@4.12.16, mongodb@7.2.0, lru-cache@11.3.5
- [x] SPEC.md 作成
- [x] 共通型定義 (shared/types/)
- [x] 環境変数設定クラス (config.ts)
- [x] MongoDB接続シングルトン (services/mongodb.ts)
- [x] APIキーサービス (services/apiKeyService.ts)
- [x] スロット確認サービス (services/slotChecker.ts)
- [x] 完了ログサービス (services/completionLogger.ts)
- [x] 認証ミドルウェア (middleware/auth.ts)
- [x] スロット確認ミドルウェア (middleware/slotGuard.ts)
- [x] SSEストリームプロキシ (proxy/streamProxy.ts)
- [x] 管理ルート (routes/admin.ts)
- [x] プロキシルート (routes/proxy.ts)
- [x] エントリーポイント (index.ts)
- [x] アーキテクチャ図 (docs/architecture.drawio)
- [x] nginx設定テンプレート (docs/nginx.conf.example)

### 環境メモ
- Bun: v1.3.13 (npm経由インストール)
- Node.js: v22.22.0
- MongoDB: ローカル稼働中 (k9db)
- llama.cpp: localhost:8080 (Qwen3.5-4B)

---

## 2026-05-01 — PHASE 2: 起動確認・SSEストリーム動作検証

### 概要
llama.cppとラッパーサーバーを実際に起動し、エンドツーエンドのSSEストリーミングを確認。
llama-cpp-run-4b.sh に `--parallel` フラグが欠落していたため修正。

### 実施内容
- [x] `llama-cpp-run-4b.sh` に `N_PARALLEL=4` 変数と `--parallel "$N_PARALLEL"` フラグを追加
- [x] llama.cppサーバー起動確認 (localhost:8080)
- [x] ラッパーサーバー起動確認 (localhost:3000, MongoDB接続OK)
- [x] `/health` エンドポイント動作確認
- [x] admin APIキー発行 (`POST /admin/keys`)
- [x] SSEストリーミング動作確認 (`POST /v1/chat/completions` with `stream:true`)
- [x] ノンストリームレスポンス動作確認 (`stream:false`)
- [x] MongoDB completion_logs への記録確認

### 発見した問題と修正
- `llama-cpp-run-4b.sh` に `--parallel` が未設定 → `N_PARALLEL=4` で固定・明示化
- Honoのルート登録順序バグ: proxyRouter が先に登録されていたため admin が401返却 → admin を先に登録
- lru-cache v11で `null` が型エラー → `{ doc: T | null }` ラッパー型で解決
- `BodyInit` がBun環境で未定義 → `string | ArrayBuffer | null` に変更

---

## 2026-05-01 — PHASE 3: スロット制御・エラー統一化・ドキュメント整備

### 概要
スロット超過時の503ハンドリング確認、全エラーレスポンスをllama.cpp/OpenAI互換形式に統一、
クライアント向け包括ドキュメントを作成。

### 実施内容
- [x] `apps/server/src/utils/errorResponse.ts` 新規作成
  - `ErrorType` 型: 6種類のエラー種別定義
  - `Errors.*` ヘルパー: 401/403/400/503/502/500/404 各エラー
  - レスポンス形式: `{"error":{"code":N,"message":"...","type":"..."}}`
- [x] 全ルート・ミドルウェアを `Errors.*` ヘルパーへ統一
  - `middleware/auth.ts`, `middleware/slotGuard.ts`
  - `routes/admin.ts`, `index.ts` (404/500ハンドラー)
- [x] `proxy/streamProxy.ts` に `proxyErrorResponse()` 追加
  - llama.cpp からの503 (レースコンディション) → `Errors.noSlots()`
  - その他非2xxは OpenAI形式でそのまま透過転送
- [x] トークン数パース修正: `"usage"` → `"timings"."prompt_n"/"predicted_n"`
- [x] TransformStream内の処理順序修正: トークン数抽出を `[DONE]` 判定より前に移動
- [x] WSL2クロックドリフト対策: `Math.max(0, Date.now() - startTime)` ガード
- [x] スロットオーバーフローテスト確認 (`tests/phase3-slot/test_slot_overflow.sh`)
  - n_predict=2048 の長プロンプトで4スロット占有、5番目が503を返すことを確認
- [x] `docs/how_to_use.md` 作成
  - 起動手順、エンドポイント一覧、認証方式、リクエストパラメーター
  - エラーレスポンス仕様 (エラー種別一覧 + JSクライアント実装例)
  - テストコマンド一覧、スロット制御説明

### 動作確認済み項目
- 401 (authentication_error): 無効APIキーで正しいエラー形式返却
- 403 (permission_error): 誤MASTER_KEYで正しいエラー形式返却
- 503 (unavailable_error): 4スロット全て占有時に5番目が503返却
- SSEストリーム: `data: [DONE]` 検知・トークン数記録・MongoDBログ正常
- TypeScript型チェック: `bun run tsc --noEmit` エラーなし
