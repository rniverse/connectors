import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import { GlideClient } from '@valkey/valkey-glide';
import type { RedisConnector } from './redis.connector.js';
import type { RedisSubscriberEvents } from './redis.type.js';
/**
 * A pub/sub subscriber on its own `GlideClient`; each message is a `message`
 * event. Glide fixes subscriptions at creation, so channels / patterns are
 * given up front, in the connector's config.
 */
export declare class RedisSubscriber extends Link<GlideClient, RedisSubscriberEvents> {
    private readonly server;
    readonly channels: readonly string[];
    readonly patterns: readonly string[];
    constructor(init: LinkInit & {
        server: RedisConnector;
        channels: string[];
        patterns: string[];
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