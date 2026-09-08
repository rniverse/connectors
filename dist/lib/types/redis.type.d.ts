export type RedisConnectorOptionsConfig = {
    requestTimeout?: number;
    connectionTimeout?: number;
    tlsInsecure?: boolean;
    appName?: string;
};
export type RedisConnectionURLConfig = {
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
export type RedisConnectorConfig = RedisConnectionURLConfig | RedisConnectionConfig;
//# sourceMappingURL=redis.type.d.ts.map