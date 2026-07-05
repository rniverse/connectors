// lib/core/redpanda.connector.ts
import { log, sleep } from '@rniverse/utils';
import { initRedpanda } from '@tools/redpanda.tool';
import { Partitioners } from 'kafkajs';
export class RedpandaConnector {
    kafka;
    adminClient = null;
    admin_promise = null;
    config;
    consumers = new Set();
    producers = new Set();
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
     * Caller is responsible for calling producer.disconnect() when done.
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
     * Caller is responsible for calling consumer.disconnect() when done.
     */
    async getConsumer(config) {
        const consumer = this.kafka.consumer(config);
        await consumer.connect();
        this.consumers.add(consumer);
        log.info({ groupId: config.groupId }, 'Redpanda consumer connected');
        return consumer;
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
        const maxRetries = Number(process.env.MAX_HEALTH_RETRIES ?? 3);
        let result = { ok: false };
        for (let i = 0; i < maxRetries && !result.ok; i++) {
            if (i > 0) {
                log.warn(`Redpanda health check failed, retrying... (${i}/${maxRetries})`);
                await sleep(1000 * i);
            }
            result = await this.ping();
        }
        if (!result.ok)
            await this.close();
        return result;
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