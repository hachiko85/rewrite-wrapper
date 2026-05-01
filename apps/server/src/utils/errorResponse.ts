/**
 * apps/server/src/utils/errorResponse.ts
 * エラーレスポンスユーティリティ / Error response utility
 *
 * llama.cpp / OpenAI API と互換性のある統一エラーフォーマットを提供する。
 * Provides a unified error format compatible with llama.cpp / OpenAI API.
 *
 * 形式 / Format:
 *   {"error": {"code": <HTTP status>, "message": "<message>", "type": "<type>"}}
 */

// ─────────────────────────────────────────────
// エラー種別 / Error types (OpenAI互換)
// ─────────────────────────────────────────────

/**
 * エラー種別の列挙 / Error type enum
 * OpenAI API の type フィールドと互換 / Compatible with OpenAI API type field
 */
export type ErrorType =
  | "authentication_error"   // APIキー認証失敗 / API key auth failure
  | "permission_error"       // 権限不足 / Insufficient permissions
  | "invalid_request_error"  // リクエスト不正 / Invalid request
  | "not_found_error"        // リソース未発見 / Resource not found
  | "server_error"           // サーバー内部エラー / Server internal error
  | "unavailable_error";     // サービス利用不可 / Service unavailable

/**
 * 標準エラーレスポンスボディの型 / Standard error response body type
 * llama.cpp / OpenAI API と同一フォーマット / Same format as llama.cpp / OpenAI API
 */
export interface ApiErrorBody {
  error: {
    code: number;
    message: string;
    type: ErrorType;
  };
}

// ─────────────────────────────────────────────
// エラービルダー / Error builder
// ─────────────────────────────────────────────

/**
 * 標準エラーオブジェクトを生成する / Creates a standard error object
 */
export function buildError(
  message: string,
  type: ErrorType,
  code: number
): ApiErrorBody {
  return { error: { code, message, type } };
}

// ─────────────────────────────────────────────
// 定義済みエラー / Predefined errors
// ─────────────────────────────────────────────

/**
 * よく使うエラーの定義済みビルダー / Predefined builders for common errors
 */
export const Errors = {
  /** 401: APIキー未提供または無効 / API key missing or invalid */
  unauthorized: (): ApiErrorBody =>
    buildError("Invalid API key. Provide a valid key via Authorization: Bearer <key> or api_key field.", "authentication_error", 401),

  /** 403: MASTER_KEY が誤っている / Wrong MASTER_KEY */
  forbidden: (): ApiErrorBody =>
    buildError("Invalid master key. Access to admin endpoints is forbidden.", "permission_error", 403),

  /** 503: スロット満杯 / All slots occupied */
  noSlots: (): ApiErrorBody =>
    buildError("No available inference slots. All slots are currently occupied. Please retry later.", "unavailable_error", 503),

  /** 502: llama.cpp への接続失敗 / Failed to connect to llama.cpp */
  upstreamUnavailable: (): ApiErrorBody =>
    buildError("Upstream LLM server is unavailable. Please check if llama.cpp is running.", "server_error", 502),

  /** 502: 上流からの空レスポンス / Empty response from upstream */
  upstreamEmpty: (): ApiErrorBody =>
    buildError("Upstream LLM server returned an empty response.", "server_error", 502),

  /** 500: 内部エラー / Internal server error */
  internal: (): ApiErrorBody =>
    buildError("An internal server error occurred.", "server_error", 500),

  /** 404: リソース未発見 / Resource not found */
  notFound: (): ApiErrorBody =>
    buildError("The requested resource was not found.", "not_found_error", 404),

  /** 400: リクエスト不正 / Bad request */
  badRequest: (msg: string): ApiErrorBody =>
    buildError(msg, "invalid_request_error", 400),
} as const;
