// lib/tools/drizzle.tool.ts
// ref: https://bun.com/docs/runtime/sql#postgresql-options

import { SQL as BunSQL } from 'bun';
import { drizzle as createORM } from 'drizzle-orm/bun-sql';
import type {
	SQLConnectorConfig,
	SQLConnectorOptionsConfig,
} from 'lib/types/sql.type';

export function initORM(connection: SQLConnectorConfig) {
	const { url, ...rest } = connection as { url?: string } & Record<string, unknown>;

	// Default pool options (timeouts in seconds for Bun SQL)
	const defaults: Partial<SQLConnectorOptionsConfig> = {
		max: 20,
		idleTimeout: 30, // 30 seconds
		maxLifetime: 3600, // 1 hour
		connectionTimeout: 30, // 30 seconds
		prepare: true,
	};

	let bunSQLClient: BunSQL;
	if (typeof url === 'string' && url.length > 0) {
		const options = { ...defaults, ...rest };
		bunSQLClient = new BunSQL(url, options);
	} else {
		const config = { ...defaults, ...rest };
		bunSQLClient = new BunSQL(config);
	}

	return createORM(bunSQLClient);
}
