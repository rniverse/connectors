import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import { GlideClient } from '@valkey/valkey-glide';
import type { RedisConnector } from './redis.connector.js';
import type { RedisMessage } from './redis.type.js';
/**
 * A pub/sub subscriber on its own `GlideClient`. Glide fixes subscriptions at
 * creation, so channels / patterns are given up front.
 */
export declare class RedisSubscriber extends Link<GlideClient> {
    private readonly parent;
    readonly channels: readonly string[];
    readonly patterns: readonly string[];
    private readonly onMessage;
    constructor(init: LinkInit & {
        parent: RedisConnector;
        channels: string[];
        patterns: string[];
        onMessage: (message: RedisMessage) => void;
    });
    protected __open(): Promise<GlideClient>;
    protected __shut(options: {
        instance: GlideClient;
    }): Promise<void>;
    protected __ping(options: {
        instance: GlideClient;
    }): Promise<Result<unknown>>;
    private __deliver;
}
//# sourceMappingURL=redis.subscriber.d.ts.map