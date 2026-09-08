// lib/core/redis.connector.ts
import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker } from '../tools/circuit-breaker.tool.js';
import { initRedis } from '../tools/redis.tool.js';
import { GlideClient, TimeUnit, } from '@valkey/valkey-glide';
export class GlideClientAdapter {
    glideClient;
    config;
    subscriptions = new Map();
    constructor(glideClient, config) {
        this.glideClient = glideClient;
        this.config = config;
    }
    async duplicate() {
        const newConfig = { ...this.config };
        let adapter;
        newConfig.pubsubSubscriptions = {
            channelsAndPatterns: {},
            callback: (msg) => {
                adapter.handlePubSubMessage(msg);
            },
        };
        const newClient = await GlideClient.createClient(newConfig);
        adapter = new GlideClientAdapter(newClient, newConfig);
        return adapter;
    }
    handlePubSubMessage(msg) {
        const channel = typeof msg.channel === 'string' ? msg.channel : msg.channel.toString();
        const callback = this.subscriptions.get(channel);
        if (callback) {
            callback(msg);
        }
    }
    async subscribe(channel, callback) {
        const wrapper = (msg) => {
            const payload = typeof msg.message === 'string' ? msg.message : msg.message.toString();
            callback(payload);
        };
        this.subscriptions.set(channel, wrapper);
        await this.glideClient.subscribe([channel], 5000);
    }
    async unsubscribe(channel) {
        const wrapper = this.subscriptions.get(channel);
        if (wrapper) {
            await this.glideClient.unsubscribe([channel], 5000);
            this.subscriptions.delete(channel);
        }
    }
    async set(key, value, options) {
        const glide = {};
        if (options?.EX !== undefined) {
            glide.expiry = { type: TimeUnit.Seconds, count: options.EX };
        }
        else if (options?.PX !== undefined) {
            glide.expiry = { type: TimeUnit.Milliseconds, count: options.PX };
        }
        else if (options?.KEEPTTL) {
            glide.expiry = 'keepExisting';
        }
        if (options?.NX)
            glide.conditionalSet = 'onlyIfDoesNotExist';
        else if (options?.XX)
            glide.conditionalSet = 'onlyIfExists';
        if (options?.GET)
            glide.returnOldValue = true;
        const res = await this.glideClient.set(key, value, Object.keys(glide).length > 0 ? glide : undefined);
        if (res === null)
            return null;
        return typeof res === 'string' ? res : res.toString();
    }
    async get(key) {
        const res = await this.glideClient.get(key);
        if (res === null)
            return null;
        return typeof res === 'string' ? res : res.toString();
    }
    async del(...keys) {
        const flattenedKeys = [];
        for (const k of keys) {
            if (Array.isArray(k)) {
                flattenedKeys.push(...k);
            }
            else {
                flattenedKeys.push(k);
            }
        }
        return await this.glideClient.del(flattenedKeys);
    }
    /** Returns true only if every given key exists. */
    async exists(...keys) {
        const flattenedKeys = keys.flat();
        if (flattenedKeys.length === 0)
            return false;
        const count = await this.glideClient.exists(flattenedKeys);
        return count === flattenedKeys.length;
    }
    async expire(key, seconds) {
        return await this.glideClient.expire(key, seconds);
    }
    async ttl(key) {
        return await this.glideClient.ttl(key);
    }
    async incr(key) {
        return await this.glideClient.incr(key);
    }
    async decr(key) {
        return await this.glideClient.decr(key);
    }
    async hset(key, field, value) {
        return await this.glideClient.hset(key, { [field]: value });
    }
    async hget(key, field) {
        const res = await this.glideClient.hget(key, field);
        if (res === null)
            return null;
        return typeof res === 'string' ? res : res.toString();
    }
    async hmset(key, fields) {
        const obj = {};
        for (let i = 0; i < fields.length; i += 2) {
            const f = fields[i];
            const v = fields[i + 1];
            if (f !== undefined && v !== undefined) {
                obj[f] = v;
            }
        }
        await this.glideClient.hset(key, obj);
        return 'OK';
    }
    async hmget(key, fields) {
        const res = await this.glideClient.hmget(key, fields);
        return res.map((val) => {
            if (val === null)
                return null;
            return typeof val === 'string' ? val : val.toString();
        });
    }
    async hincrby(key, field, increment) {
        return await this.glideClient.hincrBy(key, field, increment);
    }
    async sadd(key, ...members) {
        const flattened = [];
        for (const m of members) {
            if (Array.isArray(m)) {
                flattened.push(...m);
            }
            else {
                flattened.push(m);
            }
        }
        return await this.glideClient.sadd(key, flattened);
    }
    async smembers(key) {
        const res = await this.glideClient.smembers(key);
        return Array.from(res).map((val) => typeof val === 'string' ? val : val.toString());
    }
    async sismember(key, member) {
        return await this.glideClient.sismember(key, member);
    }
    async publish(channel, message) {
        return await this.glideClient.publish(message, channel);
    }
    async send(command, args) {
        const upperCmd = command.toUpperCase();
        if (upperCmd === 'PING') {
            const msg = args[0];
            return await this.glideClient.ping(msg ? { message: msg } : undefined);
        }
        return await this.glideClient.customCommand([command, ...args]);
    }
    close() {
        this.glideClient.close();
    }
}
export class RedisConnector {
    client = null;
    config;
    init_promise = null;
    subscribers = new Set();
    breaker = new CircuitBreaker();
    constructor(config) {
        this.config = config;
    }
    async connect() {
        if (!this.init_promise) {
            this.init_promise = this.__connect();
        }
        return this.init_promise;
    }
    async __connect() {
        try {
            const clientConfig = initRedis(this.config);
            clientConfig.pubsubSubscriptions = {
                channelsAndPatterns: {},
                callback: (msg) => {
                    if (this.client) {
                        this.client.handlePubSubMessage(msg);
                    }
                },
            };
            const glideClient = await GlideClient.createClient(clientConfig);
            this.client = new GlideClientAdapter(glideClient, clientConfig);
            await this.client.send('PING', []);
            this.breaker.reset();
            log.info('Redis connected');
        }
        catch (err) {
            this.init_promise = null;
            try {
                this.client?.close();
            }
            catch (closeErr) {
                log.error(closeErr, 'Error closing Redis client after failed connect');
            }
            this.client = null;
            log.error(err, 'Redis connection failed');
            throw err;
        }
    }
    require_client() {
        if (!this.client)
            throw new Error('Redis not connected — call connect() first');
        return this.client;
    }
    async ping() {
        try {
            const result = await this.require_client().send('PING', []);
            return { ok: true, data: result };
        }
        catch (err) {
            log.error(err, 'Redis ping failed');
            return { ok: false, error: err };
        }
    }
    async health() {
        const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
            min: 1,
            fallback: 3,
        });
        const result = await retry(() => this.ping(), {
            attempts,
            retryIf: (o) => o.ok && o.value.ok === false,
            onRetry: (_o, attempt) => log.warn(`Redis health check failed, retrying... (${attempt}/${attempts})`),
        });
        if (this.breaker.record(result.ok))
            await this.close();
        return result;
    }
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit() {
        return this.breaker.state;
    }
    getInstance() {
        return this.require_client();
    }
    /**
     * Dedicated pub/sub connections. `subscribe()` on the main client is fine
     * (glide multiplexes over RESP3), but a separate connection keeps
     * subscription traffic isolated from command traffic. Every one `add()`
     * hands out is tracked and closed by `close()`.
     */
    subscriber = {
        add: async () => {
            const sub = await this.require_client().duplicate();
            this.subscribers.add(sub);
            return sub;
        },
        release: (sub) => {
            try {
                sub.close();
            }
            catch (error) {
                log.error(error, 'Error closing Redis subscriber');
            }
            this.subscribers.delete(sub);
        },
    };
    async close() {
        for (const sub of this.subscribers) {
            try {
                sub.close();
            }
            catch (error) {
                log.error(error, 'Error closing Redis subscriber');
            }
        }
        this.subscribers.clear();
        if (this.client) {
            try {
                this.client.close();
            }
            catch (error) {
                log.error(error, 'Error closing Redis connection');
            }
        }
        this.client = null;
        this.init_promise = null;
        log.info('Redis connection closed');
    }
}
//# sourceMappingURL=redis.connector.js.map