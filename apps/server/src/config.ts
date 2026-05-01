/**
 * apps/server/src/config.ts
 * 環境変数設定クラス / Environment variable configuration class
 *
 * .env ファイルから環境変数を読み込み、型付きで提供する。
 * Reads environment variables from .env file and provides them with types.
 */

/**
 * アプリケーション設定クラス / Application configuration class
 *
 * シングルトンパターンで全設定を一元管理する。
 * Manages all configuration centrally using singleton pattern.
 */
export class AppConfig {
  private static instance: AppConfig;

  // ─── MongoDB ───────────────────────────────
  /** MongoDB接続URI / MongoDB connection URI */
  readonly mongoUri: string;
  /** データベース名 / Database name */
  readonly mongoDb: string;
  /** APIキーコレクション名 / API keys collection name */
  readonly mongoCollection: string;
  /** 完了ログコレクション名 / Completion logs collection name */
  readonly mongoLogsCollection: string;

  // ─── Backends ─────────────────────────────
  /** バックエンド設定ファイルのパス / Path to backends configuration file */
  readonly backendsConfigPath: string;

  // ─── Server ────────────────────────────────
  /** ラッパーサーバーのリスンポート / Port the wrapper server listens on */
  readonly port: number;
  /** 管理APIの認証キー / Master key for admin API authentication */
  readonly masterKey: string;

  // ─── Cache ────────────────────────────────
  /** APIキーキャッシュの最大エントリ数 / Max entries in API key LRU cache */
  readonly cacheMaxSize: number;
  /** APIキーキャッシュのTTL(ms) / TTL for API key cache in milliseconds */
  readonly cacheTtlMs: number;
  /** スロット確認キャッシュのTTL(ms) / TTL for slot check cache in milliseconds */
  readonly slotCacheTtlMs: number;

  private constructor() {
    // 必須環境変数のバリデーション / Validate required environment variables
    const mongoUri = process.env["MONGO_URI"];
    if (!mongoUri) throw new Error("MONGO_URI environment variable is required");

    const masterKey = process.env["MASTER_KEY"];
    if (!masterKey) throw new Error("MASTER_KEY environment variable is required");

    this.mongoUri = mongoUri;
    this.mongoDb = process.env["MONGO_DB"] ?? "k9db";
    this.mongoCollection = process.env["MONGO_COLLECTION"] ?? "api_keys";
    this.mongoLogsCollection = process.env["MONGO_LOGS_COLLECTION"] ?? "completion_logs";

    this.backendsConfigPath = process.env["BACKENDS_CONFIG"] ?? "./backends.yaml";

    this.port = parseInt(process.env["PORT"] ?? "3000", 10);
    this.masterKey = masterKey;

    this.cacheMaxSize = parseInt(process.env["CACHE_MAX_SIZE"] ?? "1000", 10);
    this.cacheTtlMs = parseInt(process.env["CACHE_TTL_MS"] ?? "60000", 10);
    this.slotCacheTtlMs = parseInt(process.env["SLOT_CACHE_TTL_MS"] ?? "200", 10);
  }

  /**
   * AppConfig のシングルトンインスタンスを取得する。
   * Returns the singleton instance of AppConfig.
   */
  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }
}
