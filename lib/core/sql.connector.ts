// lib/core/sql.connector.ts

import { log } from '@rniverse/utils';
import { initORM } from '@tools';
import type { SQLConnectorConfig } from '@type/sql.type';

export class SQLConnector {
	private client: ReturnType<typeof initORM> | null = null;
	private config: SQLConnectorConfig;
	private init_promise: Promise<void> | null = null;

	constructor(config: SQLConnectorConfig) {
		this.config = config;
	}

	/**
	 * Connect to SQL database via Drizzle ORM.
	 * Creates the ORM client and verifies reachability with SELECT 1.
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
			const client = initORM(this.config);
			await client.$client`SELECT 1`;
			this.client = client;
			log.info('SQL connected');
		} catch (err) {
			this.init_promise = null; // allow retry on failure
			log.error({ error: err }, 'SQL connection failed');
			throw err;
		}
	}

	private require_client() {
		if (!this.client) throw new Error('SQL not connected — call connect() first');
		return this.client;
	}

	async ping() {
		try {
			await this.require_client().$client`SELECT 1`;
			return { ok: true as const };
		} catch (err) {
			log.error({ error: err }, 'SQL ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health() {
		return this.ping();
	}

	getInstance() {
		return this.require_client();
	}

	async close(): Promise<void> {
		if (this.client) {
			// Bun SQL's close is synchronous
			this.client.$client.close();
			this.client = null;
			log.info('SQL connection closed');
		}
	}
}
