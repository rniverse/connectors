import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import type { HealthCheckOptions } from '../types/health.type.js';
import type { SQLConnectorConfig } from '../types/sql.type.js';
export declare class SQLConnector {
    private client;
    private config;
    private connection;
    private epoch;
    private checker;
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
    /**
     * Reconnect if needed, ping with a time limit and retries, and trip the
     * circuit after repeated failures — see `HealthCheck`. Never throws.
     * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
     */
    health(options?: HealthCheckOptions): Promise<Result<void>>;
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): BreakerState;
    /**
     * The health check's circuit breaker — for manual control (`open({ ms })`,
     * `reset()`) and read-only state (`failures`, `remaining`). Use
     * `health({ trial: true })` rather than `breaker.trial()` to test the
     * connection now: it reconnects and pings.
     */
    get breaker(): CircuitBreaker;
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