// lib/core/redis/redis.subscriber.ts
import { Link } from '../../shared/link.js';
import { GlideClient, GlideClientConfiguration, } from '@valkey/valkey-glide';
const text = (value) => typeof value === 'string' ? value : Buffer.from(value).toString();
/**
 * A pub/sub subscriber on its own `GlideClient`; each message is a `message`
 * event. Glide fixes subscriptions at creation, so channels / patterns are
 * given up front, in the connector's config.
 */
export class RedisSubscriber extends Link {
    server;
    channels;
    patterns;
    constructor(init) {
        super(init);
        this.server = init.server;
        this.channels = init.channels;
        this.patterns = init.patterns;
    }
    async __open() {
        // Needs its connector connected, like every extra connection.
        this.server.getInstance();
        const modes = GlideClientConfiguration.PubSubChannelModes;
        const client = await GlideClient.createClient({
            ...this.server.configuration(),
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
        this.__emit('message', {
            channel: text(msg.channel),
            ...(msg.pattern && { pattern: text(msg.pattern) }),
            message: text(msg.message),
        });
    }
}
//# sourceMappingURL=redis.subscriber.js.map