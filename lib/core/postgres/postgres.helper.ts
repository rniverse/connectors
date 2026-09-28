// lib/core/postgres/postgres.helper.ts
// ref: https://github.com/porsager/postgres#connection-options

import postgres, { type Options, type Sql } from 'postgres';
import type { PostgresConfig } from './postgres.type';

const POOL_DEFAULTS = {
	max: 20,
	idleTimeout: 30,
	connectionTimeout: 30,
	maxLifetime: 3600,
};

/** Our config → postgres.js options (camelCase → its snake_case names). */
function __options(options: {
	config: PostgresConfig;
	appName: string;
}): Options<Record<string, never>> {
	const { config } = options;
	const pool = { ...POOL_DEFAULTS, ...config.pool };
	return {
		...(config.host !== undefined && { host: config.host }),
		...(config.port !== undefined && { port: config.port }),
		...(config.database !== undefined && { database: config.database }),
		...(config.user !== undefined && { username: config.user }),
		...(config.password !== undefined && { password: config.password }),
		max: pool.max,
		idle_timeout: pool.idleTimeout,
		connect_timeout: pool.connectionTimeout,
		max_lifetime: pool.maxLifetime,
		prepare: config.prepare ?? true,
		connection: { ...config.connection, application_name: options.appName },
	};
}

/** A postgres.js client for the config: `url` and fields as given — never parsed. */
export function client(options: {
	config: PostgresConfig;
	appName: string;
}): Sql {
	const settings = __options(options);
	const { url } = options.config;
	return url ? postgres(url, settings) : postgres(settings);
}

/** A NOTIFY payload: parsed JSON when it parses, else the raw string. */
export function payload(options: { raw: string }): unknown {
	try {
		return JSON.parse(options.raw);
	} catch {
		return options.raw;
	}
}
