import type { SQLConnectorConfig } from '../types/sql.type.js';
import postgres from 'postgres';
export declare function initORM(connection: SQLConnectorConfig): import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, never>> & {
    $client: postgres.Sql<{}>;
};
//# sourceMappingURL=drizzle.tool.d.ts.map