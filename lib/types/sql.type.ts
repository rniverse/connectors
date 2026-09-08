// lib/types/sql.type.ts

export type SQLConnectorOptionsConfig = {
	max: number; // pool size (default 20)
	idleTimeout: number; // seconds (default 30)
	connectionTimeout: number; // seconds (default 30)
	maxLifetime: number; // seconds (default 3600)
	prepare: boolean; // (default true)
	// Sent to the server as application_name; shows in pg_stat_activity and logs.
	// Falls back to the INSTANCE_NAME env var, then "connectors".
	appName: string;
	// Raw postgres.js `connection` parameters (server GUCs); `application_name`
	// here is overridden by `appName` above.
	connection: Record<string, string | number | boolean>;
};

export type SQLConnectorURLConfig = {
	url: string;
} & Partial<SQLConnectorOptionsConfig>;

export type SQLConnectorHostConfig = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
} & Partial<SQLConnectorOptionsConfig>;

export type SQLConnectorConfig = SQLConnectorURLConfig | SQLConnectorHostConfig;
