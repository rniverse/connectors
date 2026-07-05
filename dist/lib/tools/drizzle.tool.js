// lib/tools/drizzle.tool.ts
// ref: https://github.com/porsager/postgres#connection-options
import { log } from '@rniverse/utils';
import { drizzle as createORM } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Maps our camelCase config keys to postgres.js's snake_case option names
function toPostgresOptions(options) {
    const { idleTimeout, connectionTimeout, maxLifetime, ...rest } = options;
    return {
        ...rest,
        ...(idleTimeout !== undefined && { idle_timeout: idleTimeout }),
        ...(connectionTimeout !== undefined && {
            connect_timeout: connectionTimeout,
        }),
        ...(maxLifetime !== undefined && { max_lifetime: maxLifetime }),
    };
}
export function initORM(connection) {
    log.debug('Initializing Drizzle ORM with config');
    const { url, ...rest } = connection;
    // Default pool options (timeouts in seconds)
    const defaults = {
        max: 20,
        idleTimeout: 30, // 30 seconds
        maxLifetime: 3600, // 1 hour
        connectionTimeout: 30, // 30 seconds
        prepare: true,
    };
    const sqlClient = typeof url === 'string' && url.length > 0
        ? postgres(url, toPostgresOptions({ ...defaults, ...rest }))
        : postgres(toPostgresOptions({ ...defaults, ...rest }));
    return createORM(sqlClient);
}
//# sourceMappingURL=drizzle.tool.js.map