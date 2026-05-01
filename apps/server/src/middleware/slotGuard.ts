/**
 * apps/server/src/middleware/slotGuard.ts
 * スロット確認ミドルウェア / Slot guard middleware
 *
 * llama.cpp のスロット空き状況を確認し、空きがなければ503を返す。
 * Checks llama.cpp slot availability and returns 503 if no slots are free.
 *
 * エラー形式 / Error format (llama.cpp / OpenAI互換):
 *   {"error": {"code": 503, "message": "...", "type": "unavailable_error"}}
 *   {"error": {"code": 502, "message": "...", "type": "server_error"}}
 */

import type { Context, Next } from "hono";
import { SlotChecker } from "../services/slotChecker.js";
import { Errors } from "../utils/errorResponse.js";

/**
 * llama.cpp スロット確認ミドルウェア。
 * llama.cpp slot guard middleware.
 *
 * 接続失敗時は 502 (Bad Gateway)、スロット満杯時は 503 を返す。
 * Returns 502 on connection failure, 503 when no slots are available.
 */
export async function slotGuardMiddleware(c: Context, next: Next): Promise<Response | void> {
  const checker = SlotChecker.getInstance();
  const result = await checker.check();

  if (!result.available) {
    const reason = result.reason ?? "Service unavailable";

    // llama.cpp への接続自体に失敗した場合は502 / 502 when connection to llama.cpp fails
    if (reason.includes("Failed to reach")) {
      return c.json(Errors.upstreamUnavailable(), 502);
    }

    // スロット満杯の場合は503 / 503 when all slots are occupied
    return c.json(Errors.noSlots(), 503);
  }

  await next();
}
