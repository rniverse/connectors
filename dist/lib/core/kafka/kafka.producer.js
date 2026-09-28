// lib/core/kafka/kafka.producer.ts
import { Link } from '../../shared/link.js';
import { Partitioners } from 'kafkajs';
/**
 * A kafkajs producer on its own connections. `ready` on kafkajs `CONNECT`,
 * `failed` on `DISCONNECT`; `ping()` reports that state (kafkajs has no
 * producer-level ping, and reconnects to brokers lazily on the next send).
 */
export class KafkaProducer extends Link {
    parent;
    settings;
    constructor(init) {
        super(init);
        this.parent = init.parent;
        this.settings = init.settings;
    }
    async __open() {
        const epoch = this.__epoch();
        const producer = this.parent.getInstance().producer({
            createPartitioner: Partitioners.DefaultPartitioner,
            ...this.settings,
        });
        producer.on(producer.events.CONNECT, () => this.__mark({ state: 'ready', epoch }));
        producer.on(producer.events.DISCONNECT, () => this.__mark({
            state: 'failed',
            epoch,
            error: new Error(`${this.label}: disconnected`),
        }));
        await producer.connect();
        return producer;
    }
    async __shut(options) {
        await options.instance.disconnect();
    }
    async __ping() {
        return this.state === 'ready'
            ? { ok: true }
            : { ok: false, error: new Error(`${this.label}: ${this.state}`) };
    }
}
//# sourceMappingURL=kafka.producer.js.map