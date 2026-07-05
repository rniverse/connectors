import type { SQLConnectorConfig } from 'lib/types/sql.type';
import postgres from 'postgres';
export declare function initORM(connection: SQLConnectorConfig): import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, never>> & {
    $client: postgres.Sql<{}>;
};
//# sourceMappingURL=drizzle.tool.d.ts.map