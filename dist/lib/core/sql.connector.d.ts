import type { Result } from '@rniverse/utils/result';
import { type CircuitState } from '../tools/circuit-breaker.tool.js';
import type { SQLConnectorConfig } from '../types/sql.type.js';
export declare class SQLConnector {
    private client;
    private config;
    private init_promise;
    private breaker;
    constructor(config: SQLConnectorConfig);
    /**
     * Connect to SQL database via Drizzle ORM.
     * Creates the ORM client and verifies reachability with SELECT 1.
     * Safe to call multiple times — subsequent calls return the same promise.
     */
    connect(): Promise<void>;
    private __connect;
    private require_client;
    /**
     * Grace period, in seconds, that postgres.js `end()` waits for in-flight
     * queries to finish before force-closing connections. Explicit value wins,
     * else `SQL_CLOSE_TIMEOUT_S`, else 5. `0` = force-close immediately.
     */
    private closeTimeout;
    ping(): Promise<Result<void>>;
    health(): Promise<Result<void>>;
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): CircuitState;
    getInstance(): import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, never>> & {
        $client: import("postgres").Sql<{}>;
    };
    /**
     * @param options.timeout seconds to wait for in-flight queries before
     * force-closing. Omit to use `SQL_CLOSE_TIMEOUT_S` (default 5); `0` closes
     * immediately.
     */
    close(options?: {
        timeout?: number;
    }): Promise<void>;
}
//# sourceMappingURL=sql.connector.d.ts.map