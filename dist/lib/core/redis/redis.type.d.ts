import type { ConnectorOptions, LinkEventMap, LinkOptions } from '../../shared/shared.type.js';
/**
 * Fields only: glide has no URL input (`GlideClient.createClient` takes
 * addresses, credentials, tls, databaseId), and a URL is never parsed here.
 * Standalone servers only — cluster mode is out of scope.
 */
export type RedisConfig = ConnectorOptions & {
    host: string;
    port: number;
    tls?: boolean;
    credentials?: {
        username?: string;
        password: string;
    };
    /** Logical database. Default 0. One per connector. */
    database?: number;
    /** ms per request, incl. glide's retries. Default 10000. */
    requestTimeout?: number;
    /** ms to establish the connection. Default 10000. */
    connectionTimeout?: number;
    /** Skip TLS certificate checks. Only with `tls`. */
    tlsInsecure?: boolean;
    /** `CLIENT SETNAME`. Required: this, else the `INSTANCE_NAME` env var. */
    appName?: string;
    /** Pub/sub subscribers, each on its own client — connected once this is ready. */
    subscribers?: RedisSubscriberOptions[];
};
export type RedisMessage = {
    channel: string;
    /** The pattern it matched, for a pattern subscription. */
    pattern?: string;
    message: string;
};
/**
 * Glide fixes subscriptions when the client is created — channels / patterns
 * are set here, up front; changing them means a new subscriber.
 */
export type RedisSubscriberOptions = LinkOptions & {
    channels?: string[];
    patterns?: string[];
};
/** Each message is a `message` event. */
export type RedisSubscriberEvents = LinkEventMap & {
    message: RedisMessage;
};
//# sourceMappingURL=redis.type.d.ts.map