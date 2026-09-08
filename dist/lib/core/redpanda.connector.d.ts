import type { Result } from '@rniverse/utils/result';
import { type CircuitState } from '../tools/circuit-breaker.tool.js';
import type { RedpandaConnectorConfig, RedpandaConnectorURLConfig } from '../types/redpanda.type.js';
import type { Admin, Consumer, ConsumerConfig, Producer, ProducerConfig } from 'kafkajs';
export declare class RedpandaConnector {
    private kafka;
    private adminClient;
    private admin_promise;
    private config;
    private consumers;
    private producers;
    private breaker;
    constructor(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig);
    /**
     * Verify connectivity by performing an admin listTopics call.
     * Returns the admin instance for immediate use.
     */
    connect(): Promise<Admin>;
    /**
     * Get or create a connected Admin client (lazy, cached).
     */
    getAdmin(): Promise<Admin>;
    private __connect_admin;
    /**
     * Create and connect a new Producer.
     * Call `connector.disconnect(producer)` when done so it is also untracked.
     */
    getProducer(config?: Partial<ProducerConfig>): Promise<ReturnType<typeof this.kafka.producer>>;
    /**
     * Create and connect a new Consumer.
     * Call `connector.disconnect(consumer)` when done so it is also untracked.
     */
    getConsumer(config: ConsumerConfig): Promise<ReturnType<typeof this.kafka.consumer>>;
    /**
     * Disconnect a producer or consumer created by this connector and stop
     * tracking it, so `close()` won't try to disconnect it again.
     */
    disconnect(client: Producer | Consumer): Promise<void>;
    ping(): Promise<Result<void>>;
    health(): Promise<Result<void>>;
    /** `closed` (healthy) · `open` (down, connections released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): CircuitState;
    getInstance(): import("kafkajs").Kafka;
    close(): Promise<void>;
}
//# sourceMappingURL=redpanda.connector.d.ts.map