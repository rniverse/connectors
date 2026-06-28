import type { KafkaConfig } from 'kafkajs';
export type RedpandaConnectorConfig = {
    brokers: string[];
    clientId?: string;
    connectionTimeout?: number;
    requestTimeout?: number;
    ssl?: boolean | {
        rejectUnauthorized?: boolean;
        ca?: string[];
        cert?: string;
        key?: string;
    };
    sasl?: {
        mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
        username: string;
        password: string;
    };
    kafka?: Partial<KafkaConfig>;
};
export type RedpandaConnectorURLConfig = {
    url: string;
    clientId?: string;
    connectionTimeout?: number;
    requestTimeout?: number;
};
//# sourceMappingURL=redpanda.type.d.ts.map