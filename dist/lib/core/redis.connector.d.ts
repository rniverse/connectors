import type { Result } from '@rniverse/utils/result';
import { type CircuitState } from '../tools/circuit-breaker.tool.js';
import type { RedisConnectorConfig } from '../types/redis.type.js';
import { GlideClient, type GlideClientConfiguration, type PubSubMsg } from '@valkey/valkey-glide';
/** Options for {@link GlideClientAdapter.set}, mapped to the driver's native set options. */
export type RedisSetOptions = {
    /** Expire the key in N seconds. */
    EX?: number;
    /** Expire the key in N milliseconds. */
    PX?: number;
    /** Keep the key's existing TTL. */
    KEEPTTL?: boolean;
    /** Only set if the key does not already exist. */
    NX?: boolean;
    /** Only set if the key already exists. */
    XX?: boolean;
    /** Return the previous value instead of `"OK"`. */
    GET?: boolean;
};
export declare class GlideClientAdapter {
    readonly glideClient: GlideClient;
    readonly config: GlideClientConfiguration;
    private subscriptions;
    constructor(glideClient: GlideClient, config: GlideClientConfiguration);
    duplicate(): Promise<GlideClientAdapter>;
    handlePubSubMessage(msg: PubSubMsg): void;
    subscribe(channel: string, callback: (message: string) => void): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
    set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    /** Returns true only if every given key exists. */
    exists(...keys: string[]): Promise<boolean>;
    expire(key: string, seconds: number): Promise<boolean>;
    ttl(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    hset(key: string, field: string, value: string): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hmset(key: string, fields: string[]): Promise<string | null>;
    hmget(key: string, fields: string[]): Promise<(string | null)[]>;
    hincrby(key: string, field: string, increment: number): Promise<number>;
    sadd(key: string, ...members: any[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    sismember(key: string, member: string): Promise<boolean>;
    publish(channel: string, message: string): Promise<number>;
    send(command: string, args: string[]): Promise<any>;
    close(): void;
}
export declare class RedisConnector {
    private client;
    private config;
    private init_promise;
    private subscribers;
    private breaker;
    constructor(config: RedisConnectorConfig);
    connect(): Promise<void>;
    private __connect;
    private require_client;
    ping(): Promise<Result<unknown>>;
    health(): Promise<Result<unknown>>;
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit(): CircuitState;
    getInstance(): GlideClientAdapter;
    /**
     * Dedicated pub/sub connections. `subscribe()` on the main client is fine
     * (glide multiplexes over RESP3), but a separate connection keeps
     * subscription traffic isolated from command traffic. Every one `add()`
     * hands out is tracked and closed by `close()`.
     */
    readonly subscriber: {
        add: () => Promise<GlideClientAdapter>;
        release: (sub: GlideClientAdapter) => void;
    };
    close(): Promise<void>;
}
//# sourceMappingURL=redis.connector.d.ts.map