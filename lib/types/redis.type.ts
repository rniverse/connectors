// lib/types/redis.type.ts

export type RedisConnectorOptionsConfig = {
	// Max time (ms) for a request to complete, including retries/reconnects (default: 10000)
	requestTimeout?: number;
	// Max time (ms) to wait for a connection to be established (default: 10000)
	connectionTimeout?: number;
	// Skip TLS certificate validation (default: false). Only relevant when TLS is on.
	tlsInsecure?: boolean;
	// Sets the connection name (CLIENT SETNAME); shows in CLIENT LIST / CLIENT INFO.
	// Falls back to the INSTANCE_NAME env var when not set.
	appName?: string;
};

export type RedisConnectionURLConfig = {
	// e.g. 'redis://localhost:6379' or 'rediss://user:pass@host:6379'
	url: string;
} & RedisConnectorOptionsConfig;

export type RedisConnectionConfig = {
	host: string;
	port: number;
	useTLS?: boolean;
	credentials?: {
		username?: string;
		password: string;
	};
} & RedisConnectorOptionsConfig;

export type RedisConnectorConfig =
	| RedisConnectionURLConfig
	| RedisConnectionConfig;
