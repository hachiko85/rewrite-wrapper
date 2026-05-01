/**
 * apps/server/src/routes/proxy.ts
 * プロキシルート / Proxy routes
 *
 * 認証 → スロット確認 → ストリームプロキシ のチェーンでリクエストを処理する。
 * Processes requests through the chain: auth → slot check → stream proxy.
 *
 * 対応エンドポイント / Supported endpoints:
 *   POST /v1/chat/completions  — OpenAI互換チャット
 *   POST /v1/completions       — OpenAI互換completion
 *   POST /completion           — llama.cpp native
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { slotGuardMiddleware } from "../middleware/slotGuard.js";
import { StreamProxy } from "../proxy/streamProxy.js";
import type { ApiKeyDocument } from "../../../../shared/types/api.js";

/** Honoコンテキスト変数型 / Hono context variable types */
type ProxyEnv = { Variables: { apiKeyDoc: ApiKeyDocument } };

/**
 * プロキシルーターを構築して返す。
 * Builds and returns the proxy router.
 */
export function buildProxyRouter(): Hono<ProxyEnv> {
  const router = new Hono<ProxyEnv>();
  const proxy = new StreamProxy();

  // ── 共通ミドルウェアチェーン / Common middleware chain ──
  // 1. 認証 → 2. スロット確認 / Auth → slot check
  router.use("*", authMiddleware, slotGuardMiddleware);

  // ── エンドポイント登録 / Register endpoints ──
  router.post("/v1/chat/completions", (c) =>
    proxy.forward(c, "/v1/chat/completions", c.get("apiKeyDoc"))
  );
  router.post("/v1/completions", (c) =>
    proxy.forward(c, "/v1/completions", c.get("apiKeyDoc"))
  );
  router.post("/completion", (c) =>
    proxy.forward(c, "/completion", c.get("apiKeyDoc"))
  );

  return router;
}
