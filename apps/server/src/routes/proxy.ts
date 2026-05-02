/**
 * apps/server/src/routes/proxy.ts
 * プロキシルート / Proxy routes
 *
 * URLパスプレフィックスを BackendRegistry で解決し、
 * 対応するバックエンドへ認証・スロット確認・ストリームプロキシのチェーンで転送する。
 *
 * Resolves the URL path prefix via BackendRegistry and forwards the request
 * to the matched backend through auth → slot check → stream proxy chain.
 *
 * ルーティング例 / Routing example:
 *   POST /qwen3.5-4b/v1/chat/completions  → http://localhost:8081/v1/chat/completions
 *   POST /qwen3.5-0.8b/v1/chat/completions → http://localhost:8082/v1/chat/completions
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { guardSlot } from "../middleware/slotGuard.js";
import { BackendRegistry } from "../services/backendRegistry.js";
import { StreamProxy } from "../proxy/streamProxy.js";
import { CompletionProxy } from "../proxy/completionProxy.js";
import { Errors } from "../utils/errorResponse.js";
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
  const completionProxy = new CompletionProxy();
  const registry = BackendRegistry.getInstance();

  // ── 認証ミドルウェアを全ルートに適用 / Apply auth middleware to all routes ──
  router.use("*", authMiddleware);

  // ── バックエンドパスプレフィックスによるルーティング / Route by backend path prefix ──
  //
  // 処理フロー / Processing flow:
  //   1. c.req.path でリクエストの完全パスを取得
  //      Get full request path via c.req.path
  //   2. BackendRegistry.findByPath() でバックエンドを特定
  //      Identify backend via BackendRegistry.findByPath()
  //   3. そのバックエンドのスロットを確認
  //      Check slots for that specific backend
  //   4. プレフィックスを除いたパスでバックエンドへ転送
  //      Forward to backend with prefix-stripped path
  router.post("/*", async (c) => {
    const fullPath = c.req.path;

    // バックエンドを解決 / Resolve backend
    const match = registry.findByPath(fullPath);
    if (!match) {
      return c.json(Errors.notFound(), 404);
    }

    const { backend, strippedPath } = match;

    // ── /:prefix/completion → カスタムレスポンス形式で返す ──
    // Custom non-streaming endpoint that returns our own response schema:
    //   { status: true/false, reason: "...", data: { output, tps, tokens, inference_time } }
    if (strippedPath === "/completion") {
      return completionProxy.forward(c, backend, c.get("apiKeyDoc"));
    }

    // ── 通常のストリームプロキシ / Standard stream proxy ──
    // このバックエンド専用のスロット確認 / Check slots for this backend
    const slotError = await guardSlot(backend.url, c);
    if (slotError) return slotError;

    // バックエンドへ転送 / Forward to backend
    return proxy.forward(c, strippedPath, c.get("apiKeyDoc"), backend.url);
  });

  return router;
}
