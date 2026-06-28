import type { SQLConnectorConfig } from '@type/sql.type';
export declare class SQLConnector {
    private client;
    private config;
    private init_promise;
    constructor(config: SQLConnectorConfig);
    /**
     * Connect to SQL database via Drizzle ORM.
     * Creates the ORM client and verifies reachability with SELECT 1.
     * Safe to call multiple times — subsequent calls return the same promise.
     */
    connect(): Promise<void>;
    private __connect;
    private require_client;
    ping(): Promise<{
        ok: true;
        error?: undefined;
    } | {
        ok: false;
        error: unknown;
    }>;
    health(): Promise<any>;
    getInstance(): import("drizzle-orm/bun-sql").BunSQLDatabase<Record<string, never>> & {
        $client: Bun.SQL;
    };
    close(): Promise<void>;
}
//# sourceMappingURL=sql.connector.d.ts.map