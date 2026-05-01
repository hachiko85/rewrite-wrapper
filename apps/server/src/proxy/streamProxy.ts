/**
 * apps/server/src/proxy/streamProxy.ts
 * SSEストリームプロキシ / SSE stream proxy
 *
 * llama.cpp へリクエストを転送し、SSEストリームをそのままクライアントへパイプする。
 * 生成完了 (data: [DONE]) を検知して完了ログを非同期で記録する。
 * llama.cpp のエラーレスポンスはそのままクライアントへ透過転送する。
 *
 * Forwards requests to llama.cpp and pipes SSE streams directly to clients.
 * Detects generation completion (data: [DONE]) and logs asynchronously.
 * llama.cpp error responses are proxied through to the client as-is.
 */

import type { Context } from "hono";
import { CompletionLogger } from "../services/completionLogger.js";
import { Errors } from "../utils/errorResponse.js";
import type { ApiKeyDocument } from "../../../../shared/types/api.js";

/**
 * SSEストリームをllama.cppからクライアントへプロキシするクラス。
 * Class that proxies SSE streams from llama.cpp to the client.
 */
export class StreamProxy {
  private logger: CompletionLogger;

  constructor() {
    this.logger = CompletionLogger.getInstance();
  }

  /**
   * バックエンドURLとパスから転送先URLを組み立てる。
   * Builds the upstream URL from backend base URL and path.
   *
   * 例: ("http://localhost:8081", "/v1/chat/completions")
   *   → "http://localhost:8081/v1/chat/completions"
   */
  private resolveUpstreamUrl(backendUrl: string, path: string): string {
    return `${backendUrl}${path}`;
  }

  /**
   * POSTボディから api_key フィールドを除去して返す。
   * Removes the api_key field from POST body and returns the cleaned body.
   *
   * llama.cppはapi_keyを知らないため、転送前に除去する。
   * llama.cpp is unaware of api_key, so it must be removed before forwarding.
   */
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key: _removed, ...rest } = body;
    return rest;
  }

  /**
   * llama.cpp のエラーレスポンス (非2xx) をクライアントへ透過転送する。
   * Proxies llama.cpp error responses (non-2xx) to the client as-is.
   *
   * llama.cppのエラーは既にOpenAI互換フォーマットなので変換不要。
   * llama.cpp errors are already in OpenAI-compatible format, no conversion needed.
   */
  private async proxyErrorResponse(c: Context, upstream: globalThis.Response): Promise<Response> {
    const body = await upstream.text();

    // スロット競合による503はラッパーの標準エラーに変換 /
    // Convert slot-conflict 503 from llama.cpp to wrapper's standard error
    if (upstream.status === 503) {
      return c.json(Errors.noSlots(), 503);
    }

    // その他のllama.cppエラーはそのまま転送 (OpenAI互換フォーマット) /
    // Other llama.cpp errors are proxied through (OpenAI-compatible format)
    try {
      const errorJson = JSON.parse(body) as Record<string, unknown>;
      return c.json(errorJson, upstream.status as 400 | 404 | 500);
    } catch {
      // JSONでなければラッパーのエラー形式で返す / Return in wrapper format if not JSON
      return c.json(Errors.upstreamUnavailable(), 502);
    }
  }

  /**
   * SSEストリームを転送する。
   * Forwards the SSE stream.
   *
   * data: [DONE] を検知してCompletionLoggerを起動する。
   * Triggers CompletionLogger upon detecting data: [DONE].
   */
  /**
   * @param backendUrl 転送先バックエンドのベースURL / Backend base URL to forward to
   */
  async forward(c: Context, path: string, apiKeyDoc: ApiKeyDocument, backendUrl: string): Promise<Response> {
    const upstreamUrl = this.resolveUpstreamUrl(backendUrl, path);
    const startTime = Date.now();

    // ── リクエストボディの取得と api_key 除去 / Read body and strip api_key ──
    let forwardBody: string | ArrayBuffer | null = null;
    const method = c.req.method;

    if (method === "POST") {
      const contentType = c.req.header("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const rawBody = await c.req.json<Record<string, unknown>>();
          const cleanBody = this.sanitizeBody(rawBody);
          forwardBody = JSON.stringify(cleanBody);
        } catch {
          forwardBody = await c.req.text();
        }
      } else {
        forwardBody = await c.req.arrayBuffer();
      }
    }

    // ── llama.cpp へリクエスト転送 / Forward request to llama.cpp ──
    let upstreamResponse: globalThis.Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers: {
          "Content-Type": c.req.header("Content-Type") ?? "application/json",
          Accept: c.req.header("Accept") ?? "text/event-stream",
        },
        body: forwardBody,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[StreamProxy] Failed to connect to upstream: ${msg}`);
      return c.json(Errors.upstreamUnavailable(), 502);
    }

    // ── llama.cpp エラーレスポンスの透過転送 / Proxy llama.cpp error responses ──
    // スロットガードをすり抜けた競合503や、不正リクエスト400などを処理する /
    // Handles race-condition 503, invalid-request 400, etc. that bypass slot guard
    if (!upstreamResponse.ok) {
      return this.proxyErrorResponse(c, upstreamResponse);
    }

    if (!upstreamResponse.body) {
      return c.json(Errors.upstreamEmpty(), 502);
    }

    // ── SSEストリームの転送 + [DONE] 検知 / Pipe SSE + detect [DONE] ──
    const logger = this.logger;
    const apiKeyId = apiKeyDoc._id;
    const decoder = new TextDecoder();
    let tokenBuffer = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let model = "unknown";

    /**
     * TransformStreamでSSEチャンクを検査し [DONE] を検知する。
     * Inspect SSE chunks via TransformStream to detect [DONE].
     */
    const detectorStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        tokenBuffer += text;

        // [DONE]検知より先にトークン数とモデル名を抽出する。
        // [DONE]と同じチャンクにtimingsが含まれる場合、バッファリセット前に処理する必要がある。
        // Extract tokens and model BEFORE [DONE] check.
        // timings may arrive in the same chunk as [DONE], so must parse before buffer reset.

        // llama.cpp は "timings" フィールドにトークン数を格納する /
        // llama.cpp stores token counts in "timings" field (not "usage")
        const promptMatch = tokenBuffer.match(/"prompt_n"\s*:\s*(\d+)/);
        const predictedMatch = tokenBuffer.match(/"predicted_n"\s*:\s*(\d+)/);
        if (promptMatch?.[1]) promptTokens = parseInt(promptMatch[1], 10);
        if (predictedMatch?.[1]) completionTokens = parseInt(predictedMatch[1], 10);

        // モデル名を取得 (存在すれば) / Extract model name if available
        const modelMatch = tokenBuffer.match(/"model"\s*:\s*"([^"]+)"/);
        if (modelMatch?.[1]) model = modelMatch[1];

        // data: [DONE] で生成完了を検知してログ記録 / Detect [DONE] and log completion
        if (tokenBuffer.includes("data: [DONE]")) {
          // WSL2のクロックドリフト対策で負値をガード / Guard against negative values from WSL2 clock drift
          const latencyMs = Math.max(0, Date.now() - startTime);
          logger.log({
            api_key_id: apiKeyId,
            model,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            latency_ms: latencyMs,
          });
          tokenBuffer = "";
        }

        controller.enqueue(chunk);
      },
    });

    const pipedStream = upstreamResponse.body.pipeThrough(detectorStream);

    // ── レスポンスヘッダーをクライアントへ転送 / Forward response headers to client ──
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstreamResponse.headers.get("Content-Type") ?? "text/event-stream"
    );
    responseHeaders.set("Cache-Control", "no-cache");
    responseHeaders.set("Connection", "keep-alive");
    responseHeaders.set("X-Accel-Buffering", "no"); // nginx バッファリング無効化 / Disable nginx buffering

    return new Response(pipedStream, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }
}
