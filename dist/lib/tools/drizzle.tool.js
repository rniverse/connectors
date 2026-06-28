// lib/tools/drizzle.tool.ts
// ref: https://bun.com/docs/runtime/sql#postgresql-options
import { SQL as BunSQL } from 'bun';
import { drizzle as createORM } from 'drizzle-orm/bun-sql';
export function initORM(connection) {
    const { url, ...rest } = connection;
    // Default pool options (timeouts in seconds for Bun SQL)
    const defaults = {
        max: 20,
        idleTimeout: 30, // 30 seconds
        maxLifetime: 3600, // 1 hour
        connectionTimeout: 30, // 30 seconds
        prepare: true,
    };
    let bunSQLClient;
    if (typeof url === 'string' && url.length > 0) {
        const options = { ...defaults, ...rest };
        bunSQLClient = new BunSQL(url, options);
    }
    else {
        const config = { ...defaults, ...rest };
        bunSQLClient = new BunSQL(config);
    }
    return createORM(bunSQLClient);
}
//# sourceMappingURL=drizzle.tool.js.map