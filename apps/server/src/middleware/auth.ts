/**
 * apps/server/src/middleware/auth.ts
 * 認証ミドルウェア / Authentication middleware
 *
 * リクエストからAPIキーを抽出し、ApiKeyServiceで照合する。
 * Extracts API key from request and validates it via ApiKeyService.
 *
 * 認証方式 / Auth methods:
 *   1. Authorization: Bearer <key>  ヘッダー / header
 *   2. POSTボディの api_key フィールド / api_key field in POST body
 *
 * エラー形式 / Error format (llama.cpp / OpenAI互換):
 *   {"error": {"code": 401, "message": "...", "type": "authentication_error"}}
 */

import type { Context, Next } from "hono";
import { ApiKeyService } from "../services/apiKeyService.js";
import { Errors } from "../utils/errorResponse.js";
import type { ApiKeyDocument } from "../../../../shared/types/api.js";

/** Hono の Variables に認証済みキー文書を追加する型 / Extend Hono Variables with authenticated key doc */
export type AuthVariables = {
  apiKeyDoc: ApiKeyDocument;
};

/**
 * APIキー認証ミドルウェア。
 * API key authentication middleware.
 *
 * 認証失敗時は 401 を返してリクエスト処理を停止する。
 * Returns 401 and stops request processing on authentication failure.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const service = ApiKeyService.getInstance();
  let key: string | undefined;

  // ── 方法1: Authorization: Bearer ヘッダー / Method 1: Authorization Bearer header ──
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice(7).trim();
  }

  // ── 方法2: POSTボディの api_key フィールド / Method 2: api_key field in POST body ──
  if (!key) {
    const contentType = c.req.header("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        // ボディをクローンして読み込む (プロキシでも再利用できるようにする) /
        // Clone body for reading (so proxy can re-read it later)
        const raw = await c.req.raw.clone().json() as Record<string, unknown>;
        if (typeof raw["api_key"] === "string") {
          key = raw["api_key"];
        }
      } catch {
        // JSON解析失敗は無視 / Ignore JSON parse failures
      }
    }
  }

  if (!key) {
    return c.json(Errors.unauthorized(), 401);
  }

  // MongoDB照合 (LRUキャッシュ付き) / MongoDB lookup (with LRU cache)
  const doc = await service.validate(key);
  if (!doc) {
    return c.json(Errors.unauthorized(), 401);
  }

  // 認証済みキー情報をコンテキストに格納 / Store authenticated key info in context
  c.set("apiKeyDoc", doc);
  await next();
}
