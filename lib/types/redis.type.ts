// lib/types/redis.type.ts

export type RedisConnectorOptionsConfig = {
	connectionTimeout?: number; // in milliseconds (default: 10000)
	idleTimeout?: number; // in milliseconds (default: 0 = no timeout)
	autoReconnect?: boolean; // (default: true)
	maxRetries?: number; // (default: 10)
	enableOfflineQueue?: boolean; // (default: true)
	enableAutoPipelining?: boolean; // (default: true)
	tls?:
		| boolean
		| {
				rejectUnauthorized?: boolean;
				ca?: string;
				cert?: string;
				key?: string;
		  };
	[key: string]: any;
};

export type RedisConnectorURLConfig = {
	url: string;
} & RedisConnectorOptionsConfig;

export type RedisConnectorConfig = RedisConnectorURLConfig;
