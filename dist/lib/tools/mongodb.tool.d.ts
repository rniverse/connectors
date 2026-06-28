import { MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';
export declare function initMongoDB(config: MongoDBConnectorConfig): Promise<{
    client: MongoClient;
    db: import("mongodb").Db;
}>;
export declare function closeMongoDB(client: MongoClient): Promise<void>;
//# sourceMappingURL=mongodb.tool.d.ts.map