// lib/core/types/sql.type.ts

export type SQLConnectorOptionsConfig = {
	max: number;
	idleTimeout: number;
	connectionTimeout: number;
	maxLifetime: number;
	prepare: boolean;
	[key: string]: any;
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

export interface SQLClient {
	db: any;
}
