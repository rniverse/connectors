import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import { type Producer, type ProducerConfig } from 'kafkajs';
import type { KafkaConnector } from './kafka.connector.js';
/**
 * A kafkajs producer on its own connections. `ready` on kafkajs `CONNECT`,
 * `failed` on `DISCONNECT`; `ping()` reports that state (kafkajs has no
 * producer-level ping, and reconnects to brokers lazily on the next send).
 */
export declare class KafkaProducer extends Link<Producer> {
    private readonly parent;
    private readonly settings;
    constructor(init: LinkInit & {
        parent: KafkaConnector;
        settings: Partial<ProducerConfig>;
    });
    protected __open(): Promise<Producer>;
    protected __shut(options: {
        instance: Producer;
    }): Promise<void>;
    protected __ping(): Promise<Result<unknown>>;
}
//# sourceMappingURL=kafka.producer.d.ts.map