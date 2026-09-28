// lib/core/redis/redis.helper.ts
const TIMEOUT_MS = 10_000;
/** Our config → glide's client configuration. */
export function configuration(options) {
    const { config } = options;
    return {
        addresses: [{ host: config.host, port: config.port }],
        useTLS: config.tls ?? false,
        ...(config.credentials && { credentials: config.credentials }),
        databaseId: config.database ?? 0,
        requestTimeout: config.requestTimeout ?? TIMEOUT_MS,
        clientName: options.appName,
        advancedConfiguration: {
            connectionTimeout: config.connectionTimeout ?? TIMEOUT_MS,
            ...(config.tlsInsecure && {
                tlsAdvancedConfiguration: { insecure: true },
            }),
        },
    };
}
//# sourceMappingURL=redis.helper.js.map