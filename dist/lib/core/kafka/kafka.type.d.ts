import type { ConnectorOptions, LinkOptions } from '../../shared/shared.type.js';
import type { ConsumerConfig, KafkaConfig as KafkaJsConfig, ProducerConfig } from 'kafkajs';
export type KafkaTLSConfig = boolean | {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
};
export type KafkaSASLConfig = {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
};
/**
 * kafkajs takes a broker list. `brokers` is that list as-is, or a
 * comma-separated string (e.g. straight from `KAFKA_BOOTSTRAP_SERVERS`), split
 * on `,` and trimmed — nothing else is read out of it.
 */
export type KafkaConfig = ConnectorOptions & {
    brokers: string | string[];
    /** kafkajs `clientId`. Required: this, else the `INSTANCE_NAME` env var. */
    appName?: string;
    /** ms, default 10000 (kafkajs's own connection timeout). */
    connectionTimeout?: number;
    /** ms, default 30000. */
    requestTimeout?: number;
    ssl?: KafkaTLSConfig;
    sasl?: KafkaSASLConfig;
    /** Raw kafkajs settings, applied last. */
    kafka?: Partial<KafkaJsConfig>;
    /** Producers — connected once this is ready. */
    producers?: KafkaProducerOptions[];
    /** Consumers — connected once this is ready; the owner subscribes + runs on `connect`. */
    consumers?: KafkaConsumerOptions[];
};
export type KafkaProducerOptions = LinkOptions & Partial<ProducerConfig>;
export type KafkaConsumerOptions = LinkOptions & ConsumerConfig;
//# sourceMappingURL=kafka.type.d.ts.map