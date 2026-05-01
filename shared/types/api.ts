/**
 * shared/types/api.ts
 * API共通型定義 / Common API type definitions
 *
 * このモジュールはリクエスト・レスポンス・MongoDB文書の型を定義する。
 * This module defines types for requests, responses, and MongoDB documents.
 */

import type { ObjectId } from "mongodb";

// ─────────────────────────────────────────────
// APIキー関連 / API Key related
// ─────────────────────────────────────────────

/**
 * MongoDBに保存するAPIキー文書の型 / MongoDB document type for API keys
 */
export interface ApiKeyDocument {
  _id: ObjectId;
  /** APIキー文字列 (indexed, unique) / API key string */
  key: string;
  /** 識別名 / Display name */
  name: string;
  /** 有効フラグ / Active flag */
  active: boolean;
  /** 作成日時 / Creation timestamp */
  created_at: Date;
  /** 最終使用日時 / Last used timestamp */
  last_used_at: Date | null;
}

/**
 * APIキー作成リクエスト / API key creation request
 */
export interface CreateApiKeyRequest {
  name: string;
}

/**
 * APIキー作成レスポンス / API key creation response
 */
export interface CreateApiKeyResponse {
  key: string;
  name: string;
  created_at: Date;
}

// ─────────────────────────────────────────────
// 完了ログ関連 / Completion log related
// ─────────────────────────────────────────────

/**
 * MongoDBに保存する完了ログ文書の型 / MongoDB document type for completion logs
 */
export interface CompletionLogDocument {
  _id?: ObjectId;
  /** 使用したAPIキーのID / ID of the API key used */
  api_key_id: ObjectId;
  /** モデル名 / Model name */
  model: string;
  /** プロンプトトークン数 / Prompt token count */
  prompt_tokens: number;
  /** 生成トークン数 / Completion token count */
  completion_tokens: number;
  /** 合計トークン数 / Total token count */
  total_tokens: number;
  /** レイテンシ(ms) / Latency in milliseconds */
  latency_ms: number;
  /** 記録日時 / Log timestamp */
  created_at: Date;
}

/**
 * 完了ログ記録に必要なデータ / Data required for logging a completion
 */
export interface CompletionLogInput {
  api_key_id: ObjectId;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
}

// ─────────────────────────────────────────────
// エラーレスポンス / Error response
// ─────────────────────────────────────────────

/**
 * 標準エラーレスポンス / Standard error response
 */
export interface ErrorResponse {
  error: string;
}
