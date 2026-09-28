// lib/core/redis/redis.connector.ts
import { Connector } from '../../shared/link.js';
import { appName } from '../../shared/setting.js';
import { GlideClient, } from '@valkey/valkey-glide';
import { configuration } from './redis.helper.js';
import { RedisSubscriber } from './redis.subscriber.js';
/**
 * One Redis / Valkey server + logical database, via glide — `getInstance()` is
 * the `GlideClient` itself. Extra connections: `subscriber()`.
 */
export class RedisConnector extends Connector {
    glide;
    constructor(config) {
        super(config);
        this.glide = configuration({
            config,
            appName: appName({ value: config.appName, connector: config.name }),
        });
    }
    /** A pub/sub subscriber on its own connection. */
    subscriber(options) {
        const { channels, patterns, onMessage, ...link } = options;
        return new RedisSubscriber({
            ...this.__child(link),
            parent: this,
            channels: channels ?? [],
            patterns: patterns ?? [],
            onMessage,
        });
    }
    get subscribers() {
        return this.scope.of({ kind: RedisSubscriber });
    }
    /** The glide configuration subscribers build their own client from. Internal. */
    configuration() {
        return this.glide;
    }
    async __open() {
        const client = await GlideClient.createClient(this.glide);
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
}
//# sourceMappingURL=redis.connector.js.map