// lib/tools/redis.tool.ts

import type { GlideClientConfiguration } from '@valkey/valkey-glide';
import type {
	RedisConnectorConfig,
	RedisConnectorOptionsConfig,
} from 'lib/types/redis.type';

export function parseRedisUrl(urlStr: string) {
	const parsed = new URL(urlStr);
	const host = parsed.hostname || 'localhost';
	const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
	const useTLS = parsed.protocol === 'rediss:';

	const credentials = parsed.password
		? {
				password: decodeURIComponent(parsed.password),
				username: parsed.username
					? decodeURIComponent(parsed.username)
					: undefined,
			}
		: undefined;

	return {
		host,
		port,
		useTLS,
		credentials,
	};
}

export function initRedis(
	connection: RedisConnectorConfig,
): GlideClientConfiguration {
	const { url, ...rest } = connection;

	// Default connection options
	const defaults: RedisConnectorOptionsConfig = {
		connectionTimeout: 10000, // 10 seconds in milliseconds
		idleTimeout: 30000, // 30 seconds in milliseconds
		autoReconnect: true,
		maxRetries: 10,
		enableOfflineQueue: true,
		enableAutoPipelining: true,
	};

	const options = { ...defaults, ...rest };

	const parsed = parseRedisUrl(url);

	const config: GlideClientConfiguration = {
		addresses: [{ host: parsed.host, port: parsed.port }],
		useTLS: parsed.useTLS || !!options.tls,
		requestTimeout: options.connectionTimeout ?? 10000,
		advancedConfiguration: {
			connectionTimeout: options.connectionTimeout ?? 10000,
		},
	};

	if (parsed.credentials) {
		config.credentials = parsed.credentials;
	}

	return config;
}
