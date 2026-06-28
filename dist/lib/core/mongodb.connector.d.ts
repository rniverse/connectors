import type { Db, MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';
export declare class MongoDBConnector {
    private db;
    private client;
    private config;
    private init_promise;
    constructor(config: MongoDBConnectorConfig);
    /**
     * Connect to MongoDB. Safe to call multiple times — subsequent calls
     * return the same promise. Must be awaited before using any operations.
     */
    connect(): Promise<Db>;
    private __connect;
    private require_db;
    private require_client;
    ping(): Promise<{
        ok: true;
        data: import("bson").Document;
        error?: undefined;
    } | {
        ok: false;
        error: unknown;
        data?: undefined;
    }>;
    health(): Promise<any>;
    getClientInstance(): MongoClient;
    getInstance(): Db;
    getDB(name: string): Db;
    close(): Promise<void>;
}
//# sourceMappingURL=mongodb.connector.d.ts.map