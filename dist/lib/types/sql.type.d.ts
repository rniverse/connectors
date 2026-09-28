import type { HealthOptions } from './health.type.js';
export type SQLConnectorOptionsConfig = {
    max: number;
    idleTimeout: number;
    connectionTimeout: number;
    maxLifetime: number;
    prepare: boolean;
    appName: string;
    connection: Record<string, string | number | boolean>;
    health: HealthOptions;
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
//# sourceMappingURL=sql.type.d.ts.map