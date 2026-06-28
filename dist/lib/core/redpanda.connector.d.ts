import type { RedpandaConnectorConfig, RedpandaConnectorURLConfig } from '@type/redpanda.type';
import type { Admin, ConsumerConfig, ProducerConfig } from 'kafkajs';
export declare class RedpandaConnector {
    private kafka;
    private adminClient;
    private admin_promise;
    private config;
    private consumers;
    private producers;
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
     * Caller is responsible for calling producer.disconnect() when done.
     */
    getProducer(config?: Partial<ProducerConfig>): Promise<ReturnType<typeof this.kafka.producer>>;
    /**
     * Create and connect a new Consumer.
     * Caller is responsible for calling consumer.disconnect() when done.
     */
    getConsumer(config: ConsumerConfig): Promise<ReturnType<typeof this.kafka.consumer>>;
    ping(): Promise<{
        ok: true;
        error?: undefined;
    } | {
        ok: false;
        error: unknown;
    }>;
    health(): Promise<any>;
    getInstance(): import("kafkajs").Kafka;
    close(): Promise<void>;
}
//# sourceMappingURL=redpanda.connector.d.ts.map