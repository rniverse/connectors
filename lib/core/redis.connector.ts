// lib/core/redis.connector.ts

import { log } from '@rniverse/utils';
import { initRedis } from '@tools/redis.tool';
import type { RedisConnectorConfig } from '@type/redis.type';

export class RedisConnector {
	client: ReturnType<typeof initRedis> | null = null;
	config: RedisConnectorConfig;

	constructor(config: RedisConnectorConfig) {
		this.config = config;
		this.client = initRedis(this.config);
	}

	async ping() {
		log.info('Pinging Redis...');
		if (!this.client) {
			return Promise.resolve({ ok: false });
		}

		try {
			const result = await this.client.send('PING', []);
			log.info(`Redis ping successful: ${result}`);
			return { ok: true };
		} catch (err) {
			log.error(`Redis ping failed: ${JSON.stringify(err)}`);
			return { ok: false };
		}
	}

	health() {
		return this.ping();
	}

	initialize() {
		// Placeholder for any initialization logic
	}

	getInstance() {
		return this.client;
	}

	close() {
		if (this.client) {
			this.client.close();
			log.info('Redis connection closed');
		}
	}
}
