/**
 * apps/server/src/services/backendRegistry.ts
 * バックエンドレジストリサービス / Backend registry service
 *
 * backends.yaml を読み込み、URLパスプレフィックスから対応するバックエンドを解決する。
 * Loads backends.yaml and resolves the matching backend from a URL path prefix.
 */

import { readFileSync } from "fs";
import { load as yamlLoad } from "js-yaml";
import type { BackendConfig } from "../../../../shared/types/api.js";

/**
 * findByPath の戻り値型 / Return type of findByPath
 */
export interface BackendMatch {
  /** マッチしたバックエンド設定 / Matched backend config */
  backend: BackendConfig;
  /**
   * プレフィックスを除去したパス / Path with prefix stripped
   * 例: /qwen3.5-4b/v1/chat/completions → /v1/chat/completions
   */
  strippedPath: string;
}

/**
 * バックエンド設定の管理・解決を担当するシングルトンサービス。
 * Singleton service responsible for managing and resolving backend configurations.
 */
export class BackendRegistry {
  private static instance: BackendRegistry;

  /**
   * 登録済みバックエンド一覧 (プレフィックス長の降順でソート済み)。
   * Registered backends sorted by prefix length descending (longest-match first).
   */
  private backends: BackendConfig[] = [];

  private constructor() {}

  /**
   * BackendRegistry のシングルトンインスタンスを取得する。
   * Returns the singleton instance of BackendRegistry.
   */
  static getInstance(): BackendRegistry {
    if (!BackendRegistry.instance) {
      BackendRegistry.instance = new BackendRegistry();
    }
    return BackendRegistry.instance;
  }

  /**
   * YAML設定ファイルを読み込んでバックエンド一覧を初期化する。
   * Loads the YAML config file and initializes the backend list.
   *
   * プレフィックスの長いものから優先してマッチするように降順ソートする。
   * Sorts by prefix length descending so longer prefixes match first.
   */
  async init(configPath: string): Promise<void> {
    let raw: string;
    try {
      raw = readFileSync(configPath, "utf-8");
    } catch (err) {
      throw new Error(
        `[BackendRegistry] backends.yaml が見つかりません: ${configPath}\n` +
          `  BACKENDS_CONFIG 環境変数で場所を指定できます。`
      );
    }

    const parsed = yamlLoad(raw) as { backends: BackendConfig[] };

    if (!Array.isArray(parsed?.backends) || parsed.backends.length === 0) {
      throw new Error(
        `[BackendRegistry] backends.yaml に有効な backends エントリがありません: ${configPath}`
      );
    }

    // バリデーション / Validate each entry
    for (const b of parsed.backends) {
      if (!b.name || !b.url || !b.pathPrefix) {
        throw new Error(
          `[BackendRegistry] 不正なバックエンドエントリ (name/url/pathPrefix が必須): ${JSON.stringify(b)}`
        );
      }
      if (!b.pathPrefix.startsWith("/")) {
        throw new Error(
          `[BackendRegistry] pathPrefix は / で始まる必要があります: "${b.pathPrefix}"`
        );
      }
    }

    // プレフィックス長の降順でソート (最長一致優先) /
    // Sort descending by prefix length (longest-match first)
    this.backends = [...parsed.backends].sort(
      (a, b) => b.pathPrefix.length - a.pathPrefix.length
    );

    console.log(`[BackendRegistry] ${this.backends.length} バックエンドを読み込みました:`);
    for (const b of this.backends) {
      console.log(`  ${b.pathPrefix.padEnd(20)} → ${b.url}  (${b.name})`);
    }
  }

  /**
   * リクエストパスに一致するバックエンドを返す。
   * Returns the backend matching the given request path.
   *
   * 登録順ではなくプレフィックス長の降順でマッチを試みる。
   * Matches by longest prefix first, not registration order.
   *
   * @returns マッチした場合は BackendMatch、該当なしは null
   */
  findByPath(path: string): BackendMatch | null {
    for (const backend of this.backends) {
      if (path.startsWith(backend.pathPrefix)) {
        // プレフィックスを除去してパスを正規化 / Strip prefix and normalize path
        const remainder = path.slice(backend.pathPrefix.length);
        const strippedPath = remainder.startsWith("/") ? remainder : `/${remainder}`;
        return { backend, strippedPath };
      }
    }
    return null;
  }

  /**
   * 全バックエンドのコピーを返す。
   * Returns a copy of all registered backends.
   */
  list(): BackendConfig[] {
    return [...this.backends];
  }
}
