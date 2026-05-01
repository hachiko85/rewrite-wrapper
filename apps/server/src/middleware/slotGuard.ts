/**
 * apps/server/src/middleware/slotGuard.ts
 * スロット確認ユーティリティ / Slot guard utility
 *
 * 指定バックエンドのスロット空き状況を確認し、
 * 空きがなければエラーレスポンスを返すユーティリティ関数。
 * 複数バックエンド対応のためHonoミドルウェアではなく
 * ルートハンドラー内から直接呼び出す形式に変更した。
 *
 * Utility function that checks slot availability for a specified backend
 * and returns an error response if none are available.
 * Changed from a Hono middleware to a direct call from route handlers
 * to support per-backend slot checking.
 *
 * エラー形式 / Error format (llama.cpp / OpenAI互換):
 *   {"error": {"code": 503, "message": "...", "type": "unavailable_error"}}
 *   {"error": {"code": 502, "message": "...", "type": "server_error"}}
 */

import type { Context } from "hono";
import { SlotChecker } from "../services/slotChecker.js";
import { Errors } from "../utils/errorResponse.js";

/**
 * 指定バックエンドのスロットを確認し、問題があればエラーレスポンスを返す。
 * Checks slot availability for the given backend and returns an error response if unavailable.
 *
 * @param backendUrl バックエンドのベースURL / Backend base URL
 * @param c Hono コンテキスト / Hono context
 * @returns 問題あり→Responseオブジェクト、問題なし→null (処理続行)
 *          Error response if unavailable, null to proceed
 */
export async function guardSlot(
  backendUrl: string,
  c: Context
): Promise<Response | null> {
  const checker = SlotChecker.getInstance();
  const result = await checker.check(backendUrl);

  if (!result.available) {
    const reason = result.reason ?? "Service unavailable";

    // llama.cpp への接続自体に失敗した場合は 502 / 502 when connection to llama.cpp fails
    if (reason.includes("Failed to reach")) {
      return c.json(Errors.upstreamUnavailable(), 502) as unknown as Response;
    }

    // スロット満杯の場合は 503 / 503 when all slots are occupied
    return c.json(Errors.noSlots(), 503) as unknown as Response;
  }

  // null = 処理続行 / null = proceed
  return null;
}
