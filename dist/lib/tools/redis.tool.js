// lib/tools/redis.tool.ts
import { environment } from '@rniverse/utils/env';
const DEFAULT_PORT = 6379;
const DEFAULT_TIMEOUT_MS = 10000;
export function parseRedisUrl(urlStr) {
    const parsed = new URL(urlStr);
    const credentials = parsed.password
        ? {
            password: decodeURIComponent(parsed.password),
            username: parsed.username
                ? decodeURIComponent(parsed.username)
                : undefined,
        }
        : undefined;
    return {
        host: parsed.hostname || 'localhost',
        port: parsed.port ? Number.parseInt(parsed.port, 10) : DEFAULT_PORT,
        useTLS: parsed.protocol === 'rediss:',
        credentials,
    };
}
function resolveConnection(connection) {
    if ('url' in connection) {
        return parseRedisUrl(connection.url);
    }
    return {
        host: connection.host,
        port: connection.port,
        useTLS: connection.useTLS ?? false,
        credentials: connection.credentials,
    };
}
export function initRedis(connection) {
    const { host, port, useTLS, credentials } = resolveConnection(connection);
    const config = {
        addresses: [{ host, port }],
        useTLS,
        requestTimeout: connection.requestTimeout ?? DEFAULT_TIMEOUT_MS,
        advancedConfiguration: {
            connectionTimeout: connection.connectionTimeout ?? DEFAULT_TIMEOUT_MS,
            ...(connection.tlsInsecure
                ? { tlsAdvancedConfiguration: { insecure: true } }
                : {}),
        },
    };
    if (credentials) {
        config.credentials = credentials;
    }
    config.clientName =
        connection.appName ?? environment.get('INSTANCE_NAME', 'connectors');
    return config;
}
//# sourceMappingURL=redis.tool.js.map