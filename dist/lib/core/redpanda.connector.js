// lib/core/redpanda.connector.ts
import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker } from '../tools/circuit-breaker.tool.js';
import { initRedpanda } from '../tools/redpanda.tool.js';
import { Partitioners } from 'kafkajs';
export class RedpandaConnector {
    kafka;
    adminClient = null;
    admin_promise = null;
    config;
    consumers = new Set();
    producers = new Set();
    breaker = new CircuitBreaker();
    constructor(config) {
        this.config = config;
        this.kafka = initRedpanda(this.config);
    }
    /**
     * Verify connectivity by performing an admin listTopics call.
     * Returns the admin instance for immediate use.
     */
    async connect() {
        const admin = await this.getAdmin();
        await admin.listTopics();
        this.breaker.reset();
        log.info('Redpanda connected');
        return admin;
    }
    /**
     * Get or create a connected Admin client (lazy, cached).
     */
    async getAdmin() {
        if (!this.admin_promise) {
            this.admin_promise = this.__connect_admin();
        }
        return this.admin_promise;
    }
    async __connect_admin() {
        try {
            const admin = this.kafka.admin();
            await admin.connect();
            this.adminClient = admin;
            return admin;
        }
        catch (err) {
            this.admin_promise = null;
            throw err;
        }
    }
    /**
     * Create and connect a new Producer.
     * Call `connector.disconnect(producer)` when done so it is also untracked.
     */
    async getProducer(config) {
        const producer = this.kafka.producer({
            createPartitioner: Partitioners.DefaultPartitioner,
            ...config,
        });
        await producer.connect();
        log.info('Redpanda producer connected');
        this.producers.add(producer);
        return producer;
    }
    /**
     * Create and connect a new Consumer.
     * Call `connector.disconnect(consumer)` when done so it is also untracked.
     */
    async getConsumer(config) {
        const consumer = this.kafka.consumer(config);
        await consumer.connect();
        this.consumers.add(consumer);
        log.info({ groupId: config.groupId }, 'Redpanda consumer connected');
        return consumer;
    }
    /**
     * Disconnect a producer or consumer created by this connector and stop
     * tracking it, so `close()` won't try to disconnect it again.
     */
    async disconnect(client) {
        await client.disconnect().catch((err) => {
            log.error(err, 'Error disconnecting Redpanda client');
        });
        this.producers.delete(client);
        this.consumers.delete(client);
    }
    async ping() {
        try {
            const admin = await this.getAdmin();
            await admin.listTopics();
            return { ok: true };
        }
        catch (err) {
            log.error(err, 'Redpanda ping failed');
            return { ok: false, error: err };
        }
    }
    async health() {
        const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
            min: 1,
            fallback: 3,
        });
        const result = await retry(() => this.ping(), {
            attempts,
            retryIf: (o) => o.ok && o.value.ok === false,
            onRetry: (_o, attempt) => log.warn(`Redpanda health check failed, retrying... (${attempt}/${attempts})`),
        });
        if (this.breaker.record(result.ok))
            await this.close();
        return result;
    }
    /** `closed` (healthy) · `open` (down, connections released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit() {
        return this.breaker.state;
    }
    getInstance() {
        return this.kafka;
    }
    async close() {
        if (this.adminClient) {
            await this.adminClient.disconnect().catch((err) => {
                log.error(err, 'Error disconnecting Redpanda admin client');
            });
        }
        this.adminClient = null;
        this.admin_promise = null;
        for (const consumer of this.consumers) {
            await consumer.disconnect().catch((err) => {
                log.error(err, 'Error disconnecting Redpanda consumer');
            });
        }
        this.consumers.clear();
        for (const producer of this.producers) {
            await producer.disconnect().catch((err) => {
                log.error(err, 'Error disconnecting Redpanda producer');
            });
        }
        this.producers.clear();
        log.info('Redpanda connections closed');
    }
}
//# sourceMappingURL=redpanda.connector.js.map