/**
 * apps/server/src/services/slotChecker.ts
 * llama.cpp スロット確認サービス / llama.cpp slot checker service
 *
 * llama.cpp の /slots エンドポイントを呼び出してスロット空き状況を確認する。
 * 短期キャッシュによりN+1リクエスト問題を防ぐ。
 *
 * Calls the /slots endpoint of llama.cpp to check slot availability.
 * Short-lived cache prevents N+1 request problem.
 */

import { AppConfig } from "../config.js";
import type { SlotCheckResult } from "../../../../shared/types/slot.js";

/**
 * llama.cpp のスロット空き確認を担当するサービスクラス。
 * Service class responsible for checking llama.cpp slot availability.
 */
export class SlotChecker {
  private static instance: SlotChecker;
  private config: AppConfig;

  /**
   * 短期キャッシュ: 同一リクエストバーストでN+1問題を防ぐ。
   * Short-lived cache: prevents N+1 problem on burst requests.
   */
  private lastResult: SlotCheckResult | null = null;
  private lastCheckAt = 0;

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
   * スロットが利用可能かどうかを確認する。
   * Checks whether a slot is available.
   *
   * llama.cpp の `?fail_on_no_slot=1` パラメーターを使用する:
   * Uses llama.cpp's `?fail_on_no_slot=1` parameter:
   * - 200: スロット空きあり / slot available
   * - 503: スロット満杯 / no slots available
   */
  async check(): Promise<SlotCheckResult> {
    const now = Date.now();

    // 短期キャッシュ内なら再利用 / Reuse cached result if within TTL
    if (this.lastResult !== null && now - this.lastCheckAt < this.config.slotCacheTtlMs) {
      return this.lastResult;
    }

    const url = `${this.config.llamaCppUrl}/slots?fail_on_no_slot=1`;

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

      this.lastResult = result;
      this.lastCheckAt = now;
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
      this.lastResult = null;
      return result;
    }
  }
}
