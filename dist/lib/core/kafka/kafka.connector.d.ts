import type { Result } from '@rniverse/utils/result';
import { Connector, type Links } from '../../shared/link.js';
import type { Admin, Kafka } from 'kafkajs';
import { KafkaConsumer } from './kafka.consumer.js';
import { KafkaProducer } from './kafka.producer.js';
import type { KafkaConfig } from './kafka.type.js';
/**
 * One Kafka / Redpanda cluster — `getInstance()` is the kafkajs `Kafka`; the
 * connector's own connection is its admin client. Extra connections:
 * `producers`, `consumers` (config).
 */
export declare class KafkaConnector extends Connector<Kafka> {
    private readonly config;
    private readonly appName;
    private readonly admins;
    constructor(config: KafkaConfig);
    /** The connector's own admin connection. */
    admin(): Admin;
    get producers(): Links<KafkaProducer>;
    get consumers(): Links<KafkaConsumer>;
    protected __open(): Promise<Kafka>;
    protected __shut(options: {
        instance: Kafka;
    }): Promise<void>;
    protected __ping(options: {
        instance: Kafka;
    }): Promise<Result<unknown>>;
}
//# sourceMappingURL=kafka.connector.d.ts.map