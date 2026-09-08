import type { Result } from '@rniverse/utils/result';
import { type CircuitState } from '../tools/circuit-breaker.tool.js';
import type { Db, MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type.js';
export declare class MongoDBConnector {
    private db;
    private client;
    private config;
    private init_promise;
    private breaker;
    constructor(config: MongoDBConnectorConfig);
    /**
     * Connect to MongoDB. Safe to call multiple times — subsequent calls
     * return the same promise. Must be awaited before using any operations.
     */
    connect(): Promise<Db>;
    private __connect;
    private require_db;
    private require_client;
    ping(): Promise<Result<Record<string, unknown>>>;
    health(): Promise<Result<Record<string, unknown>>>;
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): CircuitState;
    getClientInstance(): MongoClient;
    getInstance(): Db;
    getDB(name: string): Db;
    close(): Promise<void>;
}
//# sourceMappingURL=mongodb.connector.d.ts.map