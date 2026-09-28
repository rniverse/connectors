// lib/core/kafka/kafka.consumer.ts
import { Link } from '../../shared/link.js';
/**
 * A kafkajs consumer. `ready` only once it has joined its group — the point it
 * can actually receive messages, i.e. after the owner's `subscribe()` +
 * `run()` on `getInstance()`. Until then (and during a rebalance) it's
 * `connecting`; a crash or disconnect makes it `failed`.
 *
 * After a reconnect, the owner re-does `subscribe()` + `run()` on the
 * consumer's `connect` event.
 */
export class KafkaConsumer extends Link {
    parent;
    settings;
    constructor(init) {
        super(init);
        this.parent = init.parent;
        this.settings = init.settings;
    }
    __settled() {
        return 'connecting';
    }
    async __open() {
        const epoch = this.__epoch();
        const consumer = this.parent.getInstance().consumer(this.settings);
        const { GROUP_JOIN, REBALANCING, CRASH, DISCONNECT, STOP } = consumer.events;
        consumer.on(GROUP_JOIN, () => this.__mark({ state: 'ready', epoch }));
        consumer.on(REBALANCING, () => this.__mark({ state: 'connecting', epoch }));
        consumer.on(STOP, () => this.__mark({ state: 'connecting', epoch }));
        consumer.on(CRASH, (event) => this.__mark({ state: 'failed', epoch, error: event.payload.error }));
        consumer.on(DISCONNECT, () => this.__mark({
            state: 'failed',
            epoch,
            error: new Error(`${this.label}: disconnected`),
        }));
        await consumer.connect();
        return consumer;
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
//# sourceMappingURL=kafka.consumer.js.map