// lib/tools/redis.tool.ts
export function parseRedisUrl(urlStr) {
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
export function initRedis(connection) {
    const { url, ...rest } = connection;
    // Default connection options
    const defaults = {
        connectionTimeout: 10000, // 10 seconds in milliseconds
        idleTimeout: 30000, // 30 seconds in milliseconds
        autoReconnect: true,
        maxRetries: 10,
        enableOfflineQueue: true,
        enableAutoPipelining: true,
    };
    const options = { ...defaults, ...rest };
    const parsed = parseRedisUrl(url);
    const config = {
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
//# sourceMappingURL=redis.tool.js.map