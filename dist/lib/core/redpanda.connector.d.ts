import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import type { HealthCheckOptions } from '../types/health.type.js';
import type { RedpandaConnectorConfig, RedpandaConnectorURLConfig } from '../types/redpanda.type.js';
import type { Admin, Consumer, ConsumerConfig, Producer, ProducerConfig } from 'kafkajs';
export declare class RedpandaConnector {
    private kafka;
    private adminClient;
    private admin;
    private epoch;
    private config;
    private consumers;
    private producers;
    private checker;
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
    /**
     * Reconnect if needed, ping with a time limit and retries, and trip the
     * circuit after repeated failures — see `HealthCheck`. Never throws.
     * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
     */
    health(options?: HealthCheckOptions): Promise<Result<void>>;
    /** `closed` (healthy) · `open` (down, connections released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): BreakerState;
    /**
     * The health check's circuit breaker — for manual control (`open({ ms })`,
     * `reset()`) and read-only state (`failures`, `remaining`). Use
     * `health({ trial: true })` rather than `breaker.trial()` to test the
     * connection now: it reconnects and pings.
     */
    get breaker(): CircuitBreaker;
    getInstance(): import("kafkajs").Kafka;
    close(): Promise<void>;
}
//# sourceMappingURL=redpanda.connector.d.ts.map