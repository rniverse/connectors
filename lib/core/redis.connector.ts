// lib/core/redis.connector.ts

import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { HealthCheck } from '@tools/health.tool';
import { initRedis } from '@tools/redis.tool';
import type { HealthCheckOptions } from '@type/health.type';
import type { RedisConnectorConfig } from '@type/redis.type';
import {
	GlideClient,
	type GlideClientConfiguration,
	type PubSubMsg,
	type SetOptions,
	TimeUnit,
} from '@valkey/valkey-glide';

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

export class GlideClientAdapter {
	private subscriptions = new Map<string, (msg: PubSubMsg) => void>();

	constructor(
		public readonly glideClient: GlideClient,
		public readonly config: GlideClientConfiguration,
	) {}

	async duplicate(): Promise<GlideClientAdapter> {
		const newConfig = { ...this.config };
		let adapter: GlideClientAdapter;
		newConfig.pubsubSubscriptions = {
			channelsAndPatterns: {},
			callback: (msg: PubSubMsg) => {
				adapter.handlePubSubMessage(msg);
			},
		};
		const newClient = await GlideClient.createClient(newConfig);
		adapter = new GlideClientAdapter(newClient, newConfig);
		return adapter;
	}

	handlePubSubMessage(msg: PubSubMsg) {
		const channel =
			typeof msg.channel === 'string' ? msg.channel : msg.channel.toString();
		const callback = this.subscriptions.get(channel);
		if (callback) {
			callback(msg);
		}
	}

	async subscribe(
		channel: string,
		callback: (message: string) => void,
	): Promise<void> {
		const wrapper = (msg: PubSubMsg) => {
			const payload =
				typeof msg.message === 'string' ? msg.message : msg.message.toString();
			callback(payload);
		};
		this.subscriptions.set(channel, wrapper);
		await this.glideClient.subscribe([channel], 5000);
	}

	async unsubscribe(channel: string): Promise<void> {
		const wrapper = this.subscriptions.get(channel);
		if (wrapper) {
			await this.glideClient.unsubscribe([channel], 5000);
			this.subscriptions.delete(channel);
		}
	}

	async set(
		key: string,
		value: string,
		options?: RedisSetOptions,
	): Promise<string | null> {
		const glide: SetOptions = {};
		if (options?.EX !== undefined) {
			glide.expiry = { type: TimeUnit.Seconds, count: options.EX };
		} else if (options?.PX !== undefined) {
			glide.expiry = { type: TimeUnit.Milliseconds, count: options.PX };
		} else if (options?.KEEPTTL) {
			glide.expiry = 'keepExisting';
		}
		if (options?.NX) glide.conditionalSet = 'onlyIfDoesNotExist';
		else if (options?.XX) glide.conditionalSet = 'onlyIfExists';
		if (options?.GET) glide.returnOldValue = true;

		const res = await this.glideClient.set(
			key,
			value,
			Object.keys(glide).length > 0 ? glide : undefined,
		);
		if (res === null) return null;
		return typeof res === 'string' ? res : res.toString();
	}

	async get(key: string): Promise<string | null> {
		const res = await this.glideClient.get(key);
		if (res === null) return null;
		return typeof res === 'string' ? res : res.toString();
	}

	async del(...keys: string[]): Promise<number> {
		const flattenedKeys: string[] = [];
		for (const k of keys) {
			if (Array.isArray(k)) {
				flattenedKeys.push(...k);
			} else {
				flattenedKeys.push(k);
			}
		}
		return await this.glideClient.del(flattenedKeys);
	}

	/** Returns true only if every given key exists. */
	async exists(...keys: string[]): Promise<boolean> {
		const flattenedKeys = keys.flat();
		if (flattenedKeys.length === 0) return false;
		const count = await this.glideClient.exists(flattenedKeys);
		return count === flattenedKeys.length;
	}

	async expire(key: string, seconds: number): Promise<boolean> {
		return await this.glideClient.expire(key, seconds);
	}

	async ttl(key: string): Promise<number> {
		return await this.glideClient.ttl(key);
	}

	async incr(key: string): Promise<number> {
		return await this.glideClient.incr(key);
	}

	async decr(key: string): Promise<number> {
		return await this.glideClient.decr(key);
	}

	async hset(key: string, field: string, value: string): Promise<number> {
		return await this.glideClient.hset(key, { [field]: value });
	}

	async hget(key: string, field: string): Promise<string | null> {
		const res = await this.glideClient.hget(key, field);
		if (res === null) return null;
		return typeof res === 'string' ? res : res.toString();
	}

	async hmset(key: string, fields: string[]): Promise<string | null> {
		const obj: Record<string, string> = {};
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

	async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
		const res = await this.glideClient.hmget(key, fields);
		return res.map((val) => {
			if (val === null) return null;
			return typeof val === 'string' ? val : val.toString();
		});
	}

	async hincrby(
		key: string,
		field: string,
		increment: number,
	): Promise<number> {
		return await this.glideClient.hincrBy(key, field, increment);
	}

	async sadd(key: string, ...members: any[]): Promise<number> {
		const flattened: string[] = [];
		for (const m of members) {
			if (Array.isArray(m)) {
				flattened.push(...m);
			} else {
				flattened.push(m);
			}
		}
		return await this.glideClient.sadd(key, flattened);
	}

	async smembers(key: string): Promise<string[]> {
		const res = await this.glideClient.smembers(key);
		return Array.from(res).map((val) =>
			typeof val === 'string' ? val : val.toString(),
		);
	}

	async sismember(key: string, member: string): Promise<boolean> {
		return await this.glideClient.sismember(key, member);
	}

	async publish(channel: string, message: string): Promise<number> {
		return await this.glideClient.publish(message, channel);
	}

	async send(command: string, args: string[]): Promise<any> {
		const upperCmd = command.toUpperCase();
		if (upperCmd === 'PING') {
			const msg = args[0];
			return await this.glideClient.ping(msg ? { message: msg } : undefined);
		}
		return await this.glideClient.customCommand([command, ...args]);
	}

	close(): void {
		this.glideClient.close();
	}
}

export class RedisConnector {
	private client: GlideClientAdapter | null = null;
	private config: RedisConnectorConfig;
	private connection = lazy(() => this.__connect());
	// Bumped by close(): a connect still in flight when close() runs sees the
	// change and discards its client instead of reviving a closed connector.
	private epoch = 0;
	private subscribers = new Set<GlideClientAdapter>();
	private checker: HealthCheck<unknown>;

	constructor(config: RedisConnectorConfig) {
		const { health, ...driver } = config;
		this.config = driver;
		this.checker = new HealthCheck({ name: 'Redis', target: this, health });
	}

	async connect(): Promise<void> {
		return this.connection.get();
	}

	private async __connect(): Promise<void> {
		const epoch = this.epoch;
		// Local until verified: only a connect that's still current may become
		// `this.client`, so a stale one can never overwrite a newer client.
		let client: GlideClientAdapter | null = null;
		try {
			const clientConfig = initRedis(this.config);
			clientConfig.pubsubSubscriptions = {
				channelsAndPatterns: {},
				callback: (msg: PubSubMsg) => {
					if (this.client) {
						this.client.handlePubSubMessage(msg);
					}
				},
			};
			const glideClient = await GlideClient.createClient(clientConfig);
			client = new GlideClientAdapter(glideClient, clientConfig);
			await client.send('PING', []);
			if (epoch !== this.epoch) {
				throw new Error('Redis connection closed while connecting');
			}
			this.client = client;
			log.info('Redis connected');
		} catch (err) {
			try {
				client?.close();
			} catch (closeErr) {
				log.error(closeErr, 'Error closing Redis client after failed connect');
			}
			log.error(err, 'Redis connection failed');
			throw err;
		}
	}

	private require_client() {
		if (!this.client)
			throw new Error('Redis not connected — call connect() first');
		return this.client;
	}

	async ping(): Promise<Result<unknown>> {
		try {
			const result = await this.require_client().send('PING', []);
			return { ok: true as const, data: result };
		} catch (err) {
			log.error(err, 'Redis ping failed');
			return { ok: false as const, error: err };
		}
	}

	/**
	 * Reconnect if needed, ping with a time limit and retries, and trip the
	 * circuit after repeated failures — see `HealthCheck`. Never throws.
	 * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
	 */
	async health(options: HealthCheckOptions = {}): Promise<Result<unknown>> {
		return this.checker.check(options);
	}

	/** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
	get circuit(): BreakerState {
		return this.checker.state;
	}

	/**
	 * The health check's circuit breaker — for manual control (`open({ ms })`,
	 * `reset()`) and read-only state (`failures`, `remaining`). Use
	 * `health({ trial: true })` rather than `breaker.trial()` to test the
	 * connection now: it reconnects and pings.
	 */
	get breaker(): CircuitBreaker {
		return this.checker.breaker;
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
	readonly subscriber = {
		add: async (): Promise<GlideClientAdapter> => {
			const sub = await this.require_client().duplicate();
			this.subscribers.add(sub);
			return sub;
		},
		release: (sub: GlideClientAdapter): void => {
			try {
				sub.close();
			} catch (error) {
				log.error(error, 'Error closing Redis subscriber');
			}
			this.subscribers.delete(sub);
		},
	};

	async close(): Promise<void> {
		this.epoch++;
		this.connection.reset();
		for (const sub of this.subscribers) {
			try {
				sub.close();
			} catch (error) {
				log.error(error, 'Error closing Redis subscriber');
			}
		}
		this.subscribers.clear();

		if (this.client) {
			try {
				this.client.close();
			} catch (error) {
				log.error(error, 'Error closing Redis connection');
			}
		}
		this.client = null;
		log.info('Redis connection closed');
	}
}
