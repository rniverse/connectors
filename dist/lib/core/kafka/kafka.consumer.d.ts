import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import type { LinkState } from '../../shared/shared.type.js';
import type { Consumer, ConsumerConfig } from 'kafkajs';
import type { KafkaConnector } from './kafka.connector.js';
/**
 * A kafkajs consumer. `ready` only once it has joined its group — the point it
 * can actually receive messages, i.e. after the owner's `subscribe()` +
 * `run()` on `getInstance()`. Until then (and during a rebalance) it's
 * `connecting`; a crash or disconnect makes it `failed`.
 *
 * After a reconnect, the owner re-does `subscribe()` + `run()` on the
 * consumer's `connect` event.
 */
export declare class KafkaConsumer extends Link<Consumer> {
    private readonly parent;
    private readonly settings;
    constructor(init: LinkInit & {
        parent: KafkaConnector;
        settings: ConsumerConfig;
    });
    protected __settled(): LinkState;
    protected __open(): Promise<Consumer>;
    protected __shut(options: {
        instance: Consumer;
    }): Promise<void>;
    protected __ping(): Promise<Result<unknown>>;
}
//# sourceMappingURL=kafka.consumer.d.ts.map