// lib/core/redpanda.connector.ts
import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import { HealthCheck } from '../tools/health.tool.js';
import { initRedpanda } from '../tools/redpanda.tool.js';
import { Partitioners } from 'kafkajs';
export class RedpandaConnector {
    kafka;
    adminClient = null;
    admin = lazy(() => this.__connect_admin());
    // Bumped by close(): an admin connect still in flight when close() runs sees
    // the change and disconnects instead of reviving a closed connector.
    epoch = 0;
    config;
    consumers = new Set();
    producers = new Set();
    checker;
    constructor(config) {
        const { health, ...driver } = config;
        this.config = driver;
        this.kafka = initRedpanda(this.config);
        // `getAdmin` (not `connect`) as the reconnect step: `connect` also lists
        // topics, which `ping` does anyway.
        this.checker = new HealthCheck({
            name: 'Redpanda',
            target: {
                connect: () => this.getAdmin(),
                ping: () => this.ping(),
                close: () => this.close(),
            },
            health,
        });
    }
    /**
     * Verify connectivity by performing an admin listTopics call.
     * Returns the admin instance for immediate use.
     */
    async connect() {
        const admin = await this.getAdmin();
        await admin.listTopics();
        log.info('Redpanda connected');
        return admin;
    }
    /**
     * Get or create a connected Admin client (lazy, cached).
     */
    async getAdmin() {
        return this.admin.get();
    }
    async __connect_admin() {
        const epoch = this.epoch;
        const admin = this.kafka.admin();
        await admin.connect();
        if (epoch !== this.epoch) {
            await admin.disconnect().catch(() => { });
            throw new Error('Redpanda connection closed while connecting');
        }
        this.adminClient = admin;
        return admin;
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
    /**
     * Reconnect if needed, ping with a time limit and retries, and trip the
     * circuit after repeated failures — see `HealthCheck`. Never throws.
     * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
     */
    async health(options = {}) {
        return this.checker.check(options);
    }
    /** `closed` (healthy) · `open` (down, connections released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit() {
        return this.checker.state;
    }
    /**
     * The health check's circuit breaker — for manual control (`open({ ms })`,
     * `reset()`) and read-only state (`failures`, `remaining`). Use
     * `health({ trial: true })` rather than `breaker.trial()` to test the
     * connection now: it reconnects and pings.
     */
    get breaker() {
        return this.checker.breaker;
    }
    getInstance() {
        return this.kafka;
    }
    async close() {
        this.epoch++;
        this.admin.reset();
        if (this.adminClient) {
            await this.adminClient.disconnect().catch((err) => {
                log.error(err, 'Error disconnecting Redpanda admin client');
            });
        }
        this.adminClient = null;
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