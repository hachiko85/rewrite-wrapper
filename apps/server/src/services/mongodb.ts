/**
 * apps/server/src/services/mongodb.ts
 * MongoDB接続シングルトン / MongoDB connection singleton
 *
 * アプリケーション全体で単一のMongoClientインスタンスを共有する。
 * Shares a single MongoClient instance across the entire application.
 */

import { MongoClient, type Db } from "mongodb";
import { AppConfig } from "../config.js";

/**
 * MongoDB接続を管理するシングルトンクラス。
 * Singleton class that manages the MongoDB connection.
 */
export class MongoDbClient {
  private static instance: MongoDbClient;
  private client: MongoClient;
  private db: Db | null = null;

  private constructor(private readonly config: AppConfig) {
    // 接続プールサイズを指定してMongoClientを初期化 / Initialize MongoClient with connection pool size
    this.client = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 2,
    });
  }

  /**
   * MongoDbClient のシングルトンインスタンスを取得する。
   * Returns the singleton instance of MongoDbClient.
   */
  static getInstance(): MongoDbClient {
    if (!MongoDbClient.instance) {
      MongoDbClient.instance = new MongoDbClient(AppConfig.getInstance());
    }
    return MongoDbClient.instance;
  }

  /**
   * MongoDBに接続し、Dbインスタンスを返す。
   * Connects to MongoDB and returns the Db instance.
   */
  async connect(): Promise<Db> {
    if (this.db) return this.db;

    await this.client.connect();
    this.db = this.client.db(this.config.mongoDb);
    console.log(`[MongoDB] Connected to database: ${this.config.mongoDb}`);
    return this.db;
  }

  /**
   * 現在のDbインスタンスを返す。未接続の場合はエラーを投げる。
   * Returns the current Db instance. Throws if not connected.
   */
  getDb(): Db {
    if (!this.db) throw new Error("[MongoDB] Not connected. Call connect() first.");
    return this.db;
  }

  /**
   * MongoDB接続を閉じる / Closes the MongoDB connection
   */
  async close(): Promise<void> {
    await this.client.close();
    this.db = null;
    console.log("[MongoDB] Connection closed.");
  }
}
