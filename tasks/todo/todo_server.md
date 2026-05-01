# todo_server.md — サーバー実装チェックリスト

## PHASE 1: 基盤構築 (2026-04-30)

### セットアップ
- [x] Bun インストール
- [x] bun init + 依存パッケージインストール
- [x] SPEC.md 作成
- [x] ディレクトリ構造作成

### コアファイル
- [x] shared/types/api.ts
- [x] shared/types/slot.ts
- [x] apps/server/src/config.ts
- [x] apps/server/src/services/mongodb.ts
- [x] apps/server/src/services/apiKeyService.ts
- [x] apps/server/src/services/slotChecker.ts
- [x] apps/server/src/services/completionLogger.ts
- [x] apps/server/src/middleware/auth.ts
- [x] apps/server/src/middleware/slotGuard.ts
- [x] apps/server/src/proxy/streamProxy.ts
- [x] apps/server/src/routes/admin.ts
- [x] apps/server/src/routes/proxy.ts
- [x] apps/server/src/index.ts

### ドキュメント・図
- [x] docs/architecture.drawio
- [x] docs/nginx.conf.example
- [x] README.md 更新

### テスト
- [x] tests/phase1-setup/ 動作確認 (ヘルスチェック・起動確認)
- [x] tests/phase2-auth/ 認証テスト (401/403/admin API)
- [x] tests/phase3-slot/ スロットテスト (503 on 5th request)
- [ ] tests/phase4-proxy/ プロキシ・ストリームテスト (自動化未実装)

## PHASE 2: 起動確認・SSEストリーム動作検証 (2026-05-01) ✅

- [x] llama-cpp-run-4b.sh に --parallel フラグ追加
- [x] llama.cpp + ラッパーサーバー 起動確認
- [x] APIキー発行フロー確認
- [x] SSEストリーミング動作確認
- [x] ノンストリームレスポンス確認
- [x] MongoDB completion_logs 記録確認

## PHASE 3: スロット制御・エラー統一化・ドキュメント (2026-05-01) ✅

### エラー統一化
- [x] utils/errorResponse.ts 新規作成 (Errors.* ヘルパー)
- [x] 全エラーを {"error":{"code":N,"message":"...","type":"..."}} 形式に統一
- [x] middleware/auth.ts 更新
- [x] middleware/slotGuard.ts 更新
- [x] routes/admin.ts 更新
- [x] index.ts 404/500ハンドラー更新
- [x] proxy/streamProxy.ts に proxyErrorResponse() 追加

### バグ修正
- [x] トークン数パース: usage → timings.prompt_n/predicted_n
- [x] TransformStream処理順序: 抽出を [DONE] 判定より前に移動
- [x] WSL2クロックドリフト対策: Math.max(0, latency) ガード

### テスト・ドキュメント
- [x] tests/phase3-slot/test_slot_overflow.sh 動作確認 (503 確認済み)
- [x] docs/how_to_use.md 作成

## PHASE 4: 運用強化 (未定)
- [ ] tests/phase4-proxy/ 自動化テスト実装
- [ ] Prometheus メトリクスエンドポイント
- [ ] ログローテーション
- [ ] vllm バックエンド対応
- [ ] APIキーのハッシュ化 (bcrypt or SHA-256)
- [ ] レートリミット実装
