/**
 * apps/server/src/routes/admin.ts
 * 管理APIルート / Admin API routes
 *
 * APIキーの発行・一覧・無効化を提供する管理エンドポイント。
 * MASTER_KEY ヘッダーによる認証が必要。
 *
 * Admin endpoints for issuing, listing, and deactivating API keys.
 * Requires authentication via MASTER_KEY header.
 *
 * エラー形式 / Error format (llama.cpp / OpenAI互換):
 *   {"error": {"code": N, "message": "...", "type": "..."}}
 */

import { Hono } from "hono";
import { AppConfig } from "../config.js";
import { ApiKeyService } from "../services/apiKeyService.js";
import { Errors } from "../utils/errorResponse.js";

/**
 * 管理APIのルーターを構築して返す。
 * Builds and returns the admin API router.
 */
export function buildAdminRouter(): Hono {
  const router = new Hono();
  const config = AppConfig.getInstance();

  // ── MASTER_KEY 認証ミドルウェア / MASTER_KEY auth middleware ──
  router.use("*", async (c, next) => {
    const providedKey =
      c.req.header("X-Master-Key") ??
      c.req.header("Authorization")?.replace("Bearer ", "");
    if (providedKey !== config.masterKey) {
      return c.json(Errors.forbidden(), 403);
    }
    await next();
  });

  // ── POST /admin/keys — 新規APIキー発行 / Issue new API key ──
  router.post("/keys", async (c) => {
    let name: string;
    try {
      const body = await c.req.json<{ name?: unknown }>();
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return c.json(Errors.badRequest("'name' field is required and must be a non-empty string."), 400);
      }
      name = body.name.trim();
    } catch {
      return c.json(Errors.badRequest("Request body must be valid JSON."), 400);
    }

    const service = ApiKeyService.getInstance();
    const doc = await service.create(name);

    return c.json(
      {
        key: doc.key,
        name: doc.name,
        created_at: doc.created_at,
      },
      201
    );
  });

  // ── GET /admin/keys — APIキー一覧 / List API keys ──
  router.get("/keys", async (c) => {
    const service = ApiKeyService.getInstance();
    const keys = await service.list();
    return c.json({ keys });
  });

  // ── DELETE /admin/keys/:key — APIキー無効化 / Deactivate API key ──
  router.delete("/keys/:key", async (c) => {
    const key = c.req.param("key");
    const service = ApiKeyService.getInstance();
    const success = await service.deactivate(key);

    if (!success) {
      return c.json(Errors.notFound(), 404);
    }

    return c.json({ message: "Key deactivated successfully." });
  });

  return router;
}
