/**
 * apps/server/src/services/slotChecker.ts
 * llama.cpp スロット確認サービス / llama.cpp slot checker service
 *
 * llama.cpp の /slots エンドポイントを呼び出してスロット空き状況を確認する。
 * バックエンドURL別の短期キャッシュでN+1リクエスト問題を防ぐ。
 *
 * Calls the /slots endpoint of llama.cpp to check slot availability.
 * Per-backend-URL short-lived cache prevents N+1 request problem.
 */

import { AppConfig } from "../config.js";
import type { SlotCheckResult } from "../../../../shared/types/slot.js";

/** キャッシュエントリ型 / Cache entry type */
interface CacheEntry {
  result: SlotCheckResult;
  checkedAt: number;
}

/**
 * llama.cpp のスロット空き確認を担当するサービスクラス。
 * Service class responsible for checking llama.cpp slot availability.
 *
 * バックエンドURLをキーとした Map でキャッシュし、複数バックエンドに対応する。
 * Uses a Map keyed by backend URL to cache results per backend.
 */
export class SlotChecker {
  private static instance: SlotChecker;
  private config: AppConfig;

  /**
   * バックエンドURL別の短期キャッシュ。
   * Short-lived cache keyed by backend URL.
   */
  private cache = new Map<string, CacheEntry>();

  private constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * SlotChecker のシングルトンインスタンスを取得する。
   * Returns the singleton instance of SlotChecker.
   */
  static getInstance(): SlotChecker {
    if (!SlotChecker.instance) {
      SlotChecker.instance = new SlotChecker(AppConfig.getInstance());
    }
    return SlotChecker.instance;
  }

  /**
   * 指定バックエンドのスロットが利用可能かどうかを確認する。
   * Checks whether a slot is available for the specified backend.
   *
   * @param backendUrl バックエンドのベースURL (例: http://localhost:8081)
   *
   * llama.cpp の `?fail_on_no_slot=1` パラメーターを使用する:
   * Uses llama.cpp's `?fail_on_no_slot=1` parameter:
   * - 200: スロット空きあり / slot available
   * - 503: スロット満杯 / no slots available
   */
  async check(backendUrl: string): Promise<SlotCheckResult> {
    const now = Date.now();

    // バックエンド別キャッシュを確認 / Check per-backend cache
    const cached = this.cache.get(backendUrl);
    if (cached && now - cached.checkedAt < this.config.slotCacheTtlMs) {
      return cached.result;
    }

    const url = `${backendUrl}/slots?fail_on_no_slot=1`;

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(3000), // 3秒タイムアウト / 3-second timeout
      });

      let result: SlotCheckResult;

      if (response.status === 200) {
        result = { available: true };
      } else if (response.status === 503) {
        result = { available: false, reason: "No available slots in llama.cpp" };
      } else {
        result = {
          available: false,
          reason: `Unexpected response from llama.cpp: HTTP ${response.status}`,
        };
      }

      // 結果をバックエンド別にキャッシュ / Cache result per backend
      this.cache.set(backendUrl, { result, checkedAt: now });
      return result;
    } catch (err) {
      // 接続失敗 (llama.cpp未起動など) / Connection failure (e.g., llama.cpp not running)
      const reason = err instanceof Error ? err.message : "Unknown error";
      const result: SlotCheckResult = {
        available: false,
        reason: `Failed to reach llama.cpp: ${reason}`,
      };
      // 接続失敗はキャッシュしない (すぐリトライ可能にする) /
      // Do not cache connection failures (allow immediate retry)
      this.cache.delete(backendUrl);
      return result;
    }
  }
}
