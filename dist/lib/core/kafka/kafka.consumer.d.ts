import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import type { Consumer, ConsumerConfig } from 'kafkajs';
import type { KafkaConnector } from './kafka.connector.js';
/**
 * A kafkajs consumer. `ready` once `consumer.connect()` resolves — `connect`
 * fires then, and the owner does `subscribe()` + `run()` in its listener,
 * once per consumer object.
 *
 * kafkajs owns recovery: after a crash it restarts the same consumer (with its
 * subscription and `run()`), so this goes `connecting` and back to `ready`
 * (`recover`) on the next group join. A crash kafkajs won't restart is
 * `failed` — and stays so; the owner decides (`close()` + `connect()` for a
 * fresh consumer).
 *
 * kafkajs disconnects before it reports a crash, so a `DISCONNECT` alone only
 * means "not connected" (`connecting`) — the `CRASH` that follows decides.
 * Stop a consumer with `close()`, not the raw `disconnect()`.
 */
export declare class KafkaConsumer extends Link<Consumer> {
    private readonly cluster;
    private readonly settings;
    constructor(init: LinkInit & {
        cluster: KafkaConnector;
        settings: ConsumerConfig;
    });
    protected __open(): Promise<Consumer>;
    protected __shut(options: {
        instance: Consumer;
    }): Promise<void>;
    protected __ping(): Promise<Result<unknown>>;
}
//# sourceMappingURL=kafka.consumer.d.ts.map