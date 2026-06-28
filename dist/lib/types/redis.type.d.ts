export type RedisConnectorOptionsConfig = {
    connectionTimeout?: number;
    idleTimeout?: number;
    autoReconnect?: boolean;
    maxRetries?: number;
    enableOfflineQueue?: boolean;
    enableAutoPipelining?: boolean;
    tls?: boolean | {
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
//# sourceMappingURL=redis.type.d.ts.map