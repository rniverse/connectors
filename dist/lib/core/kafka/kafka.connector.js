// lib/core/kafka/kafka.connector.ts
import { Connector } from '../../shared/link.js';
import { appName } from '../../shared/setting.js';
import { KafkaConsumer } from './kafka.consumer.js';
import { client } from './kafka.helper.js';
import { KafkaProducer } from './kafka.producer.js';
/**
 * One Kafka / Redpanda cluster — `getInstance()` is the kafkajs `Kafka`; the
 * connector's own connection is its admin client. Extra connections:
 * `producer()`, `consumer()`.
 */
export class KafkaConnector extends Connector {
    config;
    appName;
    // The admin client of each opened Kafka — looked up via the current
    // instance, so a stale connection's admin is never handed out.
    admins = new WeakMap();
    constructor(config) {
        super(config);
        this.config = config;
        this.appName = appName({ value: config.appName, connector: config.name });
    }
    /** The connector's own admin connection. */
    admin() {
        const admin = this.admins.get(this.getInstance());
        if (!admin)
            throw this.__notReady();
        return admin;
    }
    producer(options) {
        const { name, health, on, ...settings } = options;
        return new KafkaProducer({
            ...this.__child({ name, health, on }),
            parent: this,
            settings,
        });
    }
    consumer(options) {
        const { name, health, on, ...settings } = options;
        return new KafkaConsumer({
            ...this.__child({ name, health, on }),
            parent: this,
            settings,
        });
    }
    get producers() {
        return this.scope.of({ kind: KafkaProducer });
    }
    get consumers() {
        return this.scope.of({ kind: KafkaConsumer });
    }
    async __open() {
        const kafka = client({ config: this.config, appName: this.appName });
        const admin = kafka.admin();
        try {
            await admin.connect();
            await admin.listTopics();
        }
        catch (error) {
            await admin.disconnect().catch(() => { });
            throw error;
        }
        this.admins.set(kafka, admin);
        return kafka;
    }
    async __shut(options) {
        await this.admins.get(options.instance)?.disconnect();
        this.admins.delete(options.instance);
    }
    async __ping(options) {
        const admin = this.admins.get(options.instance);
        if (!admin)
            return { ok: false, error: this.__notReady() };
        return { ok: true, data: await admin.listTopics() };
    }
}
//# sourceMappingURL=kafka.connector.js.map