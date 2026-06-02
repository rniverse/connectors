// lib/core/redis.connector.ts

import { log } from '@rniverse/utils';
import { initRedis } from '@tools/redis.tool';
import type { RedisConnectorConfig } from '@type/redis.type';
import { sleep } from 'bun';

export class RedisConnector {
	private client: ReturnType<typeof initRedis> | null = null;
	private config: RedisConnectorConfig;
	private init_promise: Promise<void> | null = null;

	constructor(config: RedisConnectorConfig) {
		this.config = config;
	}

	/**
	 * Connect to Redis. Creates the client and verifies reachability with PING.
	 * Safe to call multiple times — subsequent calls return the same promise.
	 */
	async connect(): Promise<void> {
		if (!this.init_promise) {
			this.init_promise = this.__connect();
		}
		return this.init_promise;
	}

	private async __connect(): Promise<void> {
		try {
			const client = initRedis(this.config);
			await client.send('PING', []);
			this.client = client;
			log.info('Redis connected');
		} catch (err) {
			this.init_promise = null; // allow retry on failure
			log.error({ error: err }, 'Redis connection failed');
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
			log.error({ error: err }, 'Redis ping failed');
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
				log.error({ error }, 'Error closing Redis connection');
			}
		}
		this.client = null;
		this.init_promise = null;
		log.info('Redis connection closed');
	}
}
