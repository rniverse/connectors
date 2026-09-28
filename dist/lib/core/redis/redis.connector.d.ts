import type { Result } from '@rniverse/utils/result';
import { Connector } from '../../shared/link.js';
import { GlideClient, type GlideClientConfiguration } from '@valkey/valkey-glide';
import { RedisSubscriber } from './redis.subscriber.js';
import type { RedisConfig, RedisSubscriberOptions } from './redis.type.js';
/**
 * One Redis / Valkey server + logical database, via glide — `getInstance()` is
 * the `GlideClient` itself. Extra connections: `subscriber()`.
 */
export declare class RedisConnector extends Connector<GlideClient> {
    private readonly glide;
    constructor(config: RedisConfig);
    /** A pub/sub subscriber on its own connection. */
    subscriber(options: RedisSubscriberOptions): RedisSubscriber;
    get subscribers(): ReadonlyMap<string, RedisSubscriber>;
    /** The glide configuration subscribers build their own client from. Internal. */
    configuration(): GlideClientConfiguration;
    protected __open(): Promise<GlideClient>;
    protected __shut(options: {
        instance: GlideClient;
    }): Promise<void>;
    protected __ping(options: {
        instance: GlideClient;
    }): Promise<Result<unknown>>;
}
//# sourceMappingURL=redis.connector.d.ts.map