import { SQL as BunSQL } from 'bun';
import type { SQLConnectorConfig } from 'lib/types/sql.type';
export declare function initORM(connection: SQLConnectorConfig): import("drizzle-orm/bun-sql").BunSQLDatabase<Record<string, never>> & {
    $client: BunSQL;
};
//# sourceMappingURL=drizzle.tool.d.ts.map