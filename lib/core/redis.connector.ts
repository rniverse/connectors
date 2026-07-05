// lib/core/redis.connector.ts

import { log, sleep } from '@rniverse/utils';
import { initRedis } from '@tools/redis.tool';
import type { RedisConnectorConfig } from '@type/redis.type';
import {
	GlideClient,
	type GlideClientConfiguration,
	type PubSubMsg,
	TimeUnit,
} from '@valkey/valkey-glide';

export class GlideClientAdapter {
	private subscriptions = new Map<string, any>();

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
		...args: any[]
	): Promise<string | null> {
		const options: any = {};
		if (args.length >= 2) {
			const type = args[0];
			const countVal = args[1];
			const count =
				typeof countVal === 'string' ? parseInt(countVal, 10) : countVal;
			if (type === 'EX') {
				options.expiry = { type: TimeUnit.Seconds, count };
			} else if (type === 'PX') {
				options.expiry = { type: TimeUnit.Milliseconds, count };
			}
		}
		const res = await this.glideClient.set(
			key,
			value,
			Object.keys(options).length > 0 ? options : undefined,
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

	async exists(...keys: string[]): Promise<any> {
		const flattenedKeys: string[] = [];
		for (const k of keys) {
			if (Array.isArray(k)) {
				flattenedKeys.push(...k);
			} else {
				flattenedKeys.push(k);
			}
		}
		const count = await this.glideClient.exists(flattenedKeys);
		if (flattenedKeys.length === 1 && typeof keys[0] === 'string') {
			return count > 0;
		}
		return count;
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
		const res = await this.glideClient.customCommand([
			'HINCRBY',
			key,
			field,
			increment.toString(),
		]);
		return Number(res);
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
	private init_promise: Promise<void> | null = null;

	constructor(config: RedisConnectorConfig) {
		this.config = config;
	}

	async connect(): Promise<void> {
		if (!this.init_promise) {
			this.init_promise = this.__connect();
		}
		return this.init_promise;
	}

	private async __connect(): Promise<void> {
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
			this.client = new GlideClientAdapter(glideClient, clientConfig);
			await this.client.send('PING', []);
			log.info('Redis connected');
		} catch (err) {
			this.init_promise = null;
			log.error(err, 'Redis connection failed');
			throw err;
		}
	}

	private require_client() {
		if (!this.client)
			throw new Error('Redis not connected — call connect() first');
		return this.client;
	}

	async ping() {
		try {
			const result = await this.require_client().send('PING', []);
			return { ok: true as const, data: result };
		} catch (err) {
			log.error(err, 'Redis ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health() {
		const maxRetries = Number(process.env.MAX_HEALTH_RETRIES ?? 3);
		let result: any = { ok: false };
		for (let i = 0; i < maxRetries && !result.ok; i++) {
			if (i > 0) {
				log.warn(`Redis health check failed, retrying... (${i}/${maxRetries})`);
				await sleep(1000 * i);
			}
			result = await this.ping();
		}
		if (!result.ok) await this.close();
		return result;
	}

	getInstance() {
		return this.require_client();
	}

	async close(): Promise<void> {
		if (this.client) {
			try {
				this.client.close();
			} catch (error) {
				log.error(error, 'Error closing Redis connection');
			}
		}
		this.client = null;
		this.init_promise = null;
		log.info('Redis connection closed');
	}
}
