import type { KafkaConfig } from 'kafkajs';
import type { HealthOptions } from './health.type.js';
export type RedpandaTLSConfig = boolean | {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
};
export type RedpandaSASLConfig = {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
};
export type RedpandaConnectorCommonConfig = {
    clientId?: string;
    appName?: string;
    connectionTimeout?: number;
    requestTimeout?: number;
    ssl?: RedpandaTLSConfig;
    sasl?: RedpandaSASLConfig;
    health?: HealthOptions;
    kafka?: Partial<KafkaConfig>;
};
export type RedpandaConnectorConfig = RedpandaConnectorCommonConfig & {
    brokers: string[];
};
export type RedpandaConnectorURLConfig = RedpandaConnectorCommonConfig & {
    url: string;
};
//# sourceMappingURL=redpanda.type.d.ts.map