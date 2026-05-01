/**
 * apps/server/src/services/completionLogger.ts
 * 完了ログ記録サービス / Completion log service
 *
 * LLMの生成完了後に非同期でMongoDBへログを記録する。
 * Asynchronously logs LLM completion data to MongoDB after generation finishes.
 */

import type { Collection } from "mongodb";
import { AppConfig } from "../config.js";
import { MongoDbClient } from "./mongodb.js";
import type { CompletionLogDocument, CompletionLogInput } from "../../../../shared/types/api.js";

/**
 * LLM完了ログの記録を担当するサービスクラス。
 * Service class responsible for recording LLM completion logs.
 */
export class CompletionLogger {
  private static instance: CompletionLogger;
  private collection!: Collection<CompletionLogDocument>;

  private constructor(private readonly config: AppConfig) {}

  /**
   * CompletionLogger のシングルトンインスタンスを取得する。
   * Returns the singleton instance of CompletionLogger.
   */
  static getInstance(): CompletionLogger {
    if (!CompletionLogger.instance) {
      CompletionLogger.instance = new CompletionLogger(AppConfig.getInstance());
    }
    return CompletionLogger.instance;
  }

  /**
   * コレクション参照を初期化する (起動時に一度だけ呼ぶ)。
   * Initializes the collection reference (call once at startup).
   */
  async init(): Promise<void> {
    const db = MongoDbClient.getInstance().getDb();
    this.collection = db.collection<CompletionLogDocument>(this.config.mongoLogsCollection);
    // created_atにインデックスを作成 / Create index on created_at
    await this.collection.createIndex({ created_at: -1 });
  }

  /**
   * 完了ログを非同期で記録する。ストリームのレスポンス速度に影響しない。
   * Records a completion log asynchronously. Does not affect stream response speed.
   */
  log(input: CompletionLogInput): void {
    const doc: CompletionLogDocument = {
      ...input,
      created_at: new Date(),
    };

    // 意図的に await しない (fire-and-forget) / Intentionally not awaited (fire-and-forget)
    this.collection.insertOne(doc).catch((err) => {
      console.error("[CompletionLogger] Failed to write log:", err);
    });
  }
}
