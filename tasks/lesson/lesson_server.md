# lesson_server.md — サーバー実装の学習記録

## 2026-04-30 — PHASE 1 実装時の注意点

### L1: Bunインストールにはunzipが必要
- **状況**: `curl -fsSL https://bun.sh/install | bash` が `error: unzip is required` で失敗
- **原因**: WSL2環境にunzipが未インストール、かつsudo不可
- **解決**: `npm install -g bun` でインストール可能
- **教訓**: WSL2環境でunzip/sudoが使えない場合はnpm経由でBunをインストールする

### L2: bun initが不要なindex.tsを生成する
- **状況**: `bun init -y` 実行後に `index.ts` が生成された
- **解決**: 手動で削除してから独自のエントリーポイントを作成する
- **教訓**: bun initのデフォルトファイルは必ず確認・削除する

### L3: Honoのルート登録順序が重要
- **状況**: `app.route("/admin", adminRouter)` より先に `app.route("/", proxyRouter)` を登録すると、プロキシルーターの `router.use("*", authMiddleware)` が `/admin/*` リクエストも捕捉して401を返す
- **解決**: 管理ルートを必ずプロキシルートより先に登録する
- **教訓**: Honoのroute("*")はマウント先の全パスに適用される。スコープが広いルーターは後に登録する

### L4: lru-cache v11はnull値を許容しない
- **状況**: `LRUCache<string, ApiKeyDocument | null>` で型エラー `Type 'null' is not assignable to type '{}'`
- **解決**: ラッパー型を使用: `type CacheValue = { doc: ApiKeyDocument } | { doc: null }`
- **教訓**: lru-cache v11の値型はnon-nullableである。null/undefinedをキャッシュしたい場合はオブジェクトラッパーを使う

### L5: BunコンテキストでBodyInitが未定義
- **状況**: `let forwardBody: BodyInit | null` でエラー `Cannot find name 'BodyInit'`
- **解決**: 明示的な型 `string | ArrayBuffer | null` を使用する
- **教訓**: BunのTypeScript環境では一部のWebAPI型が利用できない場合がある。具体的な型を使う

### L7: TransformStream内での処理順序に注意
- **状況**: SSE [DONE]チャンクにtimingsデータが同梱される場合、バッファリセット後に正規表現を実行すると空バッファで0を返す
- **解決**: 正規表現 (トークン数・モデル名抽出) を `[DONE]` 判定ブロックより前に移動する
- **教訓**: バッファをリセットする前に必要なデータを抽出する。順序依存の処理はコメントで明示する

### L8: llama.cppはusageではなくtimingsフィールドを使う
- **状況**: `"usage"."prompt_tokens"` の正規表現がヒットせずトークン数が0になる
- **解決**: `"prompt_n"` / `"predicted_n"` (timingsフィールド) を使うよう正規表現を変更する
- **教訓**: OpenAI互換APIとllama.cppのSSE出力フォーマットは異なる。実際のSSEストリームを確認してからパーサーを書く

### L6: Honoのjsonメソッドの型引数
- **状況**: `c.req.raw.clone().json<Record<string, unknown>>()` でエラー
- **解決**: 型引数なしで呼び出しas でキャスト: `await clone.json() as Record<string, unknown>`
- **教訓**: Requestオブジェクトの`.json()`メソッドは型引数を取らない。型アサーションを使う

---

## 2026-05-01 — PHASE 3 実装時の注意点

### L9: エラーレスポンス形式はllama.cppと揃える
- **状況**: ラッパーが `{"error":"Unauthorized"}` を返すと、クライアントがllama.cppエラーと区別できない
- **解決**: `{"error":{"code":N,"message":"...","type":"..."}}` に統一。utils/errorResponse.ts に集約
- **教訓**: プロキシサーバーのエラーは上流と同一フォーマットにする。クライアントは `error.type` で種別判定できる

### L10: llama.cppのレースコンディション503に注意
- **状況**: slotGuard で空きを確認してもリクエスト転送直前に他のリクエストがスロットを取得する場合がある
- **解決**: `streamProxy.proxyErrorResponse()` で llama.cpp からの503も `Errors.noSlots()` に変換する
- **教訓**: スロット確認とリクエスト転送の間にレースが存在する。上流エラーも必ずハンドリングする

### L11: スロットオーバーフローテストはn_predictを大きくする
- **状況**: n_predict=300 だと GPU が 2〜3秒で処理完了し、5番目のリクエスト到達前にスロットが解放される
- **解決**: n_predict=2048 + 長いプロンプト (「1から1000まで英語で書いて」) で十分に占有時間を確保
- **教訓**: スロット占有テストはモデルの処理速度を考慮してn_predictを設定する。短すぎると偽陰性になる

### L12: TransformStream内のバッファ管理
- **状況**: `data: [DONE]` と timings データが同じSSEチャンク内に届く場合、バッファリセット後に正規表現を実行すると0を返す
- **解決**: 正規表現抽出 → [DONE]判定 → バッファリセット の順に固定
- **教訓**: バッファをリセットする前に全ての抽出処理を完了させる。同一チャンク内の複数データを見落とさない
