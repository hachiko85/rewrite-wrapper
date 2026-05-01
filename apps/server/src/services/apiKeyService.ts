/**
 * apps/server/src/services/apiKeyService.ts
 * APIキーサービス / API key service
 *
 * MongoDBのapi_keysコレクションに対するCRUD操作と
 * LRUキャッシュによる高速認証照合を提供する。
 *
 * Provides CRUD operations on the api_keys MongoDB collection and
 * fast authentication lookup via LRU cache.
 */

import { LRUCache } from "lru-cache";
import { ObjectId, type Collection } from "mongodb";
import { AppConfig } from "../config.js";
import { MongoDbClient } from "./mongodb.js";
import type { ApiKeyDocument } from "../../../../shared/types/api.js";

// ─────────────────────────────────────────────
// 内部型 / Internal types
// ─────────────────────────────────────────────

/**
 * キャッシュエントリ。null不可のlru-cacheのためラッパーを使用。
 * Cache entry wrapper since lru-cache v11 requires non-nullable values.
 */
type CacheValue = { doc: ApiKeyDocument } | { doc: null };

/**
 * APIキーの検証・発行・管理を担当するサービスクラス。
 * Service class responsible for verifying, issuing, and managing API keys.
 */
export class ApiKeyService {
  private static instance: ApiKeyService;
  private collection!: Collection<ApiKeyDocument>;
  /**
   * 認証照合結果のLRUキャッシュ。MongoDB往復を削減する。
   * LRU cache for auth lookup results to reduce MongoDB round-trips.
   */
  private cache: LRUCache<string, CacheValue>;

  private constructor(private readonly config: AppConfig) {
    this.cache = new LRUCache<string, CacheValue>({
      max: config.cacheMaxSize,
      ttl: config.cacheTtlMs,
    });
  }

  /**
   * ApiKeyService のシングルトンインスタンスを取得する。
   * Returns the singleton instance of ApiKeyService.
   */
  static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService(AppConfig.getInstance());
    }
    return ApiKeyService.instance;
  }

  /**
   * コレクション参照を初期化する (起動時に一度だけ呼ぶ)。
   * Initializes the collection reference (call once at startup).
   */
  async init(): Promise<void> {
    const db = MongoDbClient.getInstance().getDb();
    this.collection = db.collection<ApiKeyDocument>(this.config.mongoCollection);
    // keyフィールドにユニークインデックスを作成 / Create unique index on key field
    await this.collection.createIndex({ key: 1 }, { unique: true });
  }

  /**
   * APIキーを照合し、有効なキー文書を返す。無効・未存在なら null を返す。
   * Validates an API key and returns the document if valid; null otherwise.
   *
   * キャッシュヒット時はMongoDBを参照しない。
   * Does not hit MongoDB on cache hit.
   */
  async validate(key: string): Promise<ApiKeyDocument | null> {
    // キャッシュ確認 / Check cache first
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached.doc;

    // MongoDBで照合 / Look up in MongoDB
    const doc = await this.collection.findOne({ key, active: true });

    // 結果をラッパー付きでキャッシュ (存在しないキーもキャッシュしてDB負荷を下げる) /
    // Cache result with wrapper (also cache missing keys to reduce DB load)
    this.cache.set(key, { doc: doc ?? null });

    if (doc) {
      // 最終使用日時を非同期更新 (レスポンスを遅らせない) /
      // Update last_used_at asynchronously (do not delay response)
      this.collection
        .updateOne({ _id: doc._id }, { $set: { last_used_at: new Date() } })
        .catch((err) => console.error("[ApiKeyService] Failed to update last_used_at:", err));
    }

    return doc ?? null;

  }

  /**
   * 新規APIキーを発行してMongoDBに保存する。
   * Issues a new API key and saves it to MongoDB.
   */
  async create(name: string): Promise<ApiKeyDocument> {
    // crypto.randomUUID() でランダムキーを生成 / Generate random key with crypto.randomUUID()
    const key = `sk-${crypto.randomUUID().replace(/-/g, "")}`;
    const now = new Date();
    const doc: Omit<ApiKeyDocument, "_id"> = {
      key,
      name,
      active: true,
      created_at: now,
      last_used_at: null,
    };

    const result = await this.collection.insertOne(doc as ApiKeyDocument);
    return { ...doc, _id: result.insertedId } as ApiKeyDocument;
  }

  /**
   * APIキーを無効化 (論理削除) する。
   * Deactivates (soft-deletes) an API key.
   */
  async deactivate(key: string): Promise<boolean> {
    const result = await this.collection.updateOne({ key }, { $set: { active: false } });
    // キャッシュから除去して即時反映 / Remove from cache for immediate effect
    this.cache.delete(key);
    return result.modifiedCount > 0;
  }

  /**
   * 全APIキー一覧を返す (パスワード/セキュリティ上、keyは最初の8文字のみ)。
   * Returns all API keys (key field truncated to 8 chars for security).
   */
  async list(): Promise<Omit<ApiKeyDocument, "key">[]> {
    return this.collection
      .find({}, { projection: { key: 0 } })
      .sort({ created_at: -1 })
      .toArray() as unknown as Omit<ApiKeyDocument, "key">[];
  }
}

