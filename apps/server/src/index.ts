/**
 * apps/server/src/index.ts
 * アプリケーションエントリーポイント / Application entry point
 *
 * Honoアプリを組み立て、MongoDBに接続し、サーバーを起動する。
 * Assembles the Hono app, connects to MongoDB, and starts the server.
 */

import { Hono } from "hono";
import { AppConfig } from "./config.js";
import { MongoDbClient } from "./services/mongodb.js";
import { ApiKeyService } from "./services/apiKeyService.js";
import { CompletionLogger } from "./services/completionLogger.js";
import { buildProxyRouter } from "./routes/proxy.js";
import { buildAdminRouter } from "./routes/admin.js";
import { Errors } from "./utils/errorResponse.js";

/**
 * アプリケーションのメイン初期化・起動処理。
 * Main initialization and startup of the application.
 */
async function main(): Promise<void> {
  // ── 設定読み込み / Load configuration ──
  const config = AppConfig.getInstance();

  // ── MongoDB接続 / Connect to MongoDB ──
  const mongoClient = MongoDbClient.getInstance();
  await mongoClient.connect();

  // ── サービス初期化 / Initialize services ──
  await ApiKeyService.getInstance().init();
  await CompletionLogger.getInstance().init();

  console.log("[Server] Services initialized.");

  // ── Honoアプリ組み立て / Assemble Hono app ──
  const app = new Hono();

  // ヘルスチェック / Health check
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      upstream: config.llamaCppUrl,
      timestamp: new Date().toISOString(),
    })
  );

  // 管理ルートを先に登録してプロキシ認証ミドルウェアに流れないようにする /
  // Register admin routes first to prevent proxy auth middleware from intercepting them
  app.route("/admin", buildAdminRouter());

  // プロキシルート / Proxy routes
  app.route("/", buildProxyRouter());

  // 404ハンドラー / 404 handler
  app.notFound((c) => c.json(Errors.notFound(), 404));

  // グローバルエラーハンドラー / Global error handler
  app.onError((err, c) => {
    console.error("[Server] Unhandled error:", err);
    return c.json(Errors.internal(), 500);
  });

  // ── サーバー起動 / Start server ──
  console.log(`[Server] Starting on port ${config.port}...`);
  console.log(`[Server] Upstream: ${config.llamaCppUrl}`);

  Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });

  console.log(`[Server] Listening on http://localhost:${config.port}`);

  // ── シャットダウン処理 / Graceful shutdown ──
  process.on("SIGINT", async () => {
    console.log("\n[Server] Shutting down...");
    await mongoClient.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("[Server] SIGTERM received. Shutting down...");
    await mongoClient.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
