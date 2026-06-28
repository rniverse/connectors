import type { RedisConnectorConfig } from '@type/redis.type';
import { GlideClient, type GlideClientConfiguration, type PubSubMsg } from '@valkey/valkey-glide';
export declare class GlideClientAdapter {
    readonly glideClient: GlideClient;
    readonly config: GlideClientConfiguration;
    private subscriptions;
    constructor(glideClient: GlideClient, config: GlideClientConfiguration);
    duplicate(): Promise<GlideClientAdapter>;
    handlePubSubMessage(msg: PubSubMsg): void;
    subscribe(channel: string, callback: (message: string) => void): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
    set(key: string, value: string, ...args: any[]): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<any>;
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
    constructor(config: RedisConnectorConfig);
    connect(): Promise<void>;
    private __connect;
    private require_client;
    ping(): Promise<{
        ok: true;
        data: any;
        error?: undefined;
    } | {
        ok: false;
        error: unknown;
        data?: undefined;
    }>;
    health(): Promise<any>;
    getInstance(): GlideClientAdapter;
    close(): Promise<void>;
}
//# sourceMappingURL=redis.connector.d.ts.map