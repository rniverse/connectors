// lib/core/kafka/kafka.helper.ts
import { Kafka } from 'kafkajs';
/** An array as-is; a comma-separated string split and trimmed. */
export function brokers(options) {
    const { value } = options;
    if (Array.isArray(value))
        return value;
    return value
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean);
}
/** Our config → a kafkajs `Kafka` client (no connection yet). */
export function client(options) {
    const { config } = options;
    const settings = {
        clientId: options.appName,
        brokers: brokers({ value: config.brokers }),
        connectionTimeout: config.connectionTimeout ?? 10_000,
        requestTimeout: config.requestTimeout ?? 30_000,
        ...(config.ssl !== undefined && { ssl: config.ssl }),
        // kafkajs models SASL as a union on `mechanism`; ours is one plain shape.
        ...(config.sasl !== undefined && {
            sasl: config.sasl,
        }),
    };
    return new Kafka({ ...settings, ...config.kafka });
}
//# sourceMappingURL=kafka.helper.js.map