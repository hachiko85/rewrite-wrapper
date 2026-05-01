/**
 * shared/types/slot.ts
 * llama.cpp スロット型定義 / llama.cpp slot type definitions
 *
 * llama.cpp の /slots エンドポイントが返すデータ構造を定義する。
 * Defines the data structures returned by the /slots endpoint of llama.cpp.
 */

/**
 * llama.cpp スロットの状態 / llama.cpp slot state
 * 0: IDLE (空き), 1: PROCESSING (処理中)
 */
export type SlotState = 0 | 1;

/**
 * llama.cpp /slots エンドポイントの単一スロット情報 / Single slot info from /slots endpoint
 */
export interface LlamaCppSlot {
  /** スロットID / Slot ID */
  id: number;
  /** タスクID (-1 = 未使用) / Task ID (-1 = unused) */
  id_task: number;
  /** 処理中フラグ / Processing flag */
  is_processing: boolean;
  /** コンテキストサイズ / Context size */
  n_ctx: number;
  /** 使用中のKVキャッシュトークン数 / Used KV cache tokens */
  n_past: number;
}

/**
 * スロット確認結果 / Slot check result
 */
export interface SlotCheckResult {
  /** スロットが利用可能かどうか / Whether a slot is available */
  available: boolean;
  /** エラーメッセージ (利用不可時) / Error message when unavailable */
  reason?: string;
}
