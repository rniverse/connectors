// lib/tools/redis.tool.ts
// ref: https://bun.com/docs/runtime/redis#connection-options

import { RedisClient } from 'bun';
import type {
	RedisConnectorConfig,
	RedisConnectorOptionsConfig,
} from 'lib/types/redis.type';

export function initRedis(connection: RedisConnectorConfig) {
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

	return new RedisClient(url, options);
}
