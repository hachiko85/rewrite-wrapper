/**
 * apps/server/src/proxy/completionProxy.ts
 * カスタム /completion エンドポイントプロキシ / Custom /completion endpoint proxy
 *
 * /:prefix/completion へのリクエストを llama.cpp の /completion (stream:false) へ転送し、
 * レスポンスを独自形式に変換して返す。
 *
 * Forwards /:prefix/completion requests to llama.cpp's /completion (stream:false),
 * then transforms the response into a custom format before returning to the client.
 *
 * レスポンス形式 / Response format:
 *   成功 / Success: { status: true,  reason: "xxxの推論に成功しました。", data: { output, tps, tokens, inference_time } }
 *   失敗 / Failure: { status: false, reason: "エラー理由",               data: {} }
 */

import type { Context } from "hono";
import type {
  ApiKeyDocument,
  BackendConfig,
  CustomCompletionResponse,
} from "../../../../shared/types/api.js";
import { CompletionLogger } from "../services/completionLogger.js";

/**
 * llama.cpp /completion レスポンスの必要フィールド型。
 * Relevant fields from llama.cpp /completion (non-streaming) response.
 */
interface LlamaCppCompletionResult {
  content?: string;
  model?: string;
  tokens_predicted?: number;
  tokens_evaluated?: number;
  timings?: {
    /** 単位時間当たりの生成トークン数 / Generated tokens per second */
    predicted_per_second?: number;
    /** 生成トークン数 / Number of generated tokens */
    predicted_n?: number;
    /** 生成にかかった時間(ms) / Generation time in milliseconds */
    predicted_ms?: number;
    /** プロンプトトークン数 / Prompt token count */
    prompt_n?: number;
  };
  error?: { message?: string } | string;
}

/**
 * /:prefix/completion のカスタムレスポンスを処理するプロキシクラス。
 * Proxy class that handles custom responses for /:prefix/completion.
 */
export class CompletionProxy {
  private readonly logger: CompletionLogger;

  constructor() {
    this.logger = CompletionLogger.getInstance();
  }

  /**
   * POSTボディから api_key を除去し stream を false に強制して返す。
   * Strips api_key from body and forces stream: false.
   */
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key: _removed, stream: _stream, ...rest } = body;
    return { ...rest, stream: false };
  }

  /**
   * 失敗レスポンスを生成するヘルパー。
   * Helper to build a failure response.
   */
  private fail(c: Context, reason: string, status: number): Response {
    return c.json<CustomCompletionResponse>(
      { status: false, reason, data: {} },
      status as 400 | 422 | 500 | 502 | 503
    );
  }

  /**
   * llama.cpp へリクエストを転送し、カスタム形式で返す。
   * Forwards request to llama.cpp and returns response in custom format.
   *
   * @param c       Hono コンテキスト / Hono context
   * @param backend 転送先バックエンド設定 / Target backend config
   * @param apiKeyDoc 認証済みAPIキー文書 / Authenticated API key document
   */
  async forward(
    c: Context,
    backend: BackendConfig,
    apiKeyDoc: ApiKeyDocument
  ): Promise<Response> {
    const upstreamUrl = `${backend.url}/completion`;
    const startTime = Date.now();

    // ── リクエストボディの解析と整形 / Parse and sanitize request body ──
    let forwardBody: string;
    try {
      const rawBody = await c.req.json<Record<string, unknown>>();
      forwardBody = JSON.stringify(this.sanitizeBody(rawBody));
    } catch {
      return this.fail(c, "リクエストボディが不正なJSONです。 / Invalid JSON in request body.", 400);
    }

    // ── llama.cpp へ転送 / Forward to llama.cpp ──
    let upstreamResponse: globalThis.Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: forwardBody,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return this.fail(c, `バックエンドに接続できませんでした: ${msg}`, 502);
    }

    // ── レスポンスのパース / Parse upstream response ──
    let result: LlamaCppCompletionResult;
    try {
      result = (await upstreamResponse.json()) as LlamaCppCompletionResult;
    } catch {
      return this.fail(c, "バックエンドからの応答を解析できませんでした。 / Failed to parse backend response.", 502);
    }

    // ── llama.cpp エラーの処理 / Handle llama.cpp errors ──
    if (!upstreamResponse.ok || result.error) {
      const errMsg =
        typeof result.error === "string"
          ? result.error
          : (result.error?.message ?? `バックエンドエラー (HTTP ${upstreamResponse.status})`);
      return this.fail(c, errMsg, upstreamResponse.status || 500);
    }

    // ── 推論結果の抽出 / Extract inference results ──
    const output        = result.content ?? "";
    const tps           = result.timings?.predicted_per_second ?? 0;
    const tokens        = result.timings?.predicted_n ?? result.tokens_predicted ?? 0;
    const inferenceTime = (result.timings?.predicted_ms ?? 0) / 1000;
    const model         = result.model ?? backend.name;
    const promptTokens  = result.timings?.prompt_n ?? result.tokens_evaluated ?? 0;
    const latencyMs     = Math.max(0, Date.now() - startTime);

    // ── MongoDB へログ記録 (fire-and-forget) / Log to MongoDB asynchronously ──
    this.logger.log({
      api_key_id: apiKeyDoc._id,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: tokens,
      total_tokens: promptTokens + tokens,
      latency_ms: latencyMs,
    });

    // ── カスタムレスポンスを返す / Return custom response ──
    return c.json<CustomCompletionResponse>({
      status: true,
      reason: `${backend.name}の推論に成功しました。`,
      data: {
        output,
        tps:            Math.round(tps * 10) / 10,
        tokens,
        inference_time: Math.round(inferenceTime * 100) / 100,
      },
    });
  }
}
