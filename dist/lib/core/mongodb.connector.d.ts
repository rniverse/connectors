import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import type { Db, MongoClient } from 'mongodb';
import type { HealthCheckOptions } from '../types/health.type.js';
import type { MongoDBConnectorConfig } from '../types/mongodb.type.js';
export declare class MongoDBConnector {
    private db;
    private client;
    private config;
    private connection;
    private epoch;
    private checker;
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
    /**
     * Reconnect if needed, ping with a time limit and retries, and trip the
     * circuit after repeated failures — see `HealthCheck`. Never throws.
     * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
     */
    health(options?: HealthCheckOptions): Promise<Result<Record<string, unknown>>>;
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): BreakerState;
    /**
     * The health check's circuit breaker — for manual control (`open({ ms })`,
     * `reset()`) and read-only state (`failures`, `remaining`). Use
     * `health({ trial: true })` rather than `breaker.trial()` to test the
     * connection now: it reconnects and pings.
     */
    get breaker(): CircuitBreaker;
    getClientInstance(): MongoClient;
    getInstance(): Db;
    getDB(name: string): Db;
    close(): Promise<void>;
}
//# sourceMappingURL=mongodb.connector.d.ts.map