// lib/core/redis/redis.subscriber.ts
import { log } from '@rniverse/utils/logger';
import { Link } from '../../shared/link.js';
import { GlideClient, GlideClientConfiguration, } from '@valkey/valkey-glide';
const text = (value) => typeof value === 'string' ? value : Buffer.from(value).toString();
/**
 * A pub/sub subscriber on its own `GlideClient`. Glide fixes subscriptions at
 * creation, so channels / patterns are given up front.
 */
export class RedisSubscriber extends Link {
    parent;
    channels;
    patterns;
    onMessage;
    constructor(init) {
        super(init);
        this.parent = init.parent;
        this.channels = init.channels;
        this.patterns = init.patterns;
        this.onMessage = init.onMessage;
    }
    async __open() {
        // Needs its connector connected, like every extra connection.
        this.parent.getInstance();
        const modes = GlideClientConfiguration.PubSubChannelModes;
        const client = await GlideClient.createClient({
            ...this.parent.configuration(),
            pubsubSubscriptions: {
                channelsAndPatterns: {
                    [modes.Exact]: new Set(this.channels),
                    [modes.Pattern]: new Set(this.patterns),
                },
                callback: (msg) => this.__deliver({ msg }),
            },
        });
        try {
            await client.ping();
        }
        catch (error) {
            client.close();
            throw error;
        }
        return client;
    }
    async __shut(options) {
        options.instance.close();
    }
    async __ping(options) {
        return { ok: true, data: await options.instance.ping() };
    }
    __deliver(options) {
        const { msg } = options;
        try {
            this.onMessage({
                channel: text(msg.channel),
                ...(msg.pattern && { pattern: text(msg.pattern) }),
                message: text(msg.message),
            });
        }
        catch (error) {
            log.error(error, `${this.label}: onMessage failed`);
        }
    }
}
//# sourceMappingURL=redis.subscriber.js.map