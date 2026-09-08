// lib/core/mongodb.connector.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker, type CircuitState } from '@tools/circuit-breaker.tool';
import { initMongoDB } from '@tools/mongodb.tool';
import type { Db, MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

export class MongoDBConnector {
	private db: Db | null = null;
	private client: MongoClient | null = null;
	private config: MongoDBConnectorConfig;
	private init_promise: Promise<Db> | null = null;
	private breaker = new CircuitBreaker();

	constructor(config: MongoDBConnectorConfig) {
		this.config = config;
	}

	/**
	 * Connect to MongoDB. Safe to call multiple times — subsequent calls
	 * return the same promise. Must be awaited before using any operations.
	 */
	async connect(): Promise<Db> {
		if (!this.init_promise) {
			this.init_promise = this.__connect();
		}
		return this.init_promise;
	}

	private async __connect(): Promise<Db> {
		try {
			const { client, db } = await initMongoDB(this.config);
			this.client = client;
			this.db = db;
			this.breaker.reset();
			return db;
		} catch (error) {
			this.init_promise = null; // allow retry on failure
			log.error(error, 'Failed to initialize MongoDB connector');
			throw error;
		}
	}

	private require_db(): Db {
		if (!this.db)
			throw new Error('MongoDB not connected — call connect() first');
		return this.db;
	}

	private require_client(): MongoClient {
		if (!this.client)
			throw new Error('MongoDB not connected — call connect() first');
		return this.client;
	}

	async ping(): Promise<Result<Record<string, unknown>>> {
		try {
			const db = this.require_db();
			const data = await db.admin().ping();
			return { ok: true as const, data };
		} catch (err) {
			log.error(err, 'MongoDB ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health(): Promise<Result<Record<string, unknown>>> {
		const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
			min: 1,
			fallback: 3,
		});
		const result = await retry(() => this.ping(), {
			attempts,
			retryIf: (o) => o.ok && o.value.ok === false,
			onRetry: (_o, attempt) =>
				log.warn(
					`MongoDB health check failed, retrying... (${attempt}/${attempts})`,
				),
		});
		if (this.breaker.record(result.ok)) await this.close();
		return result;
	}

	/** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
	get circuit(): CircuitState {
		return this.breaker.state;
	}

	getClientInstance(): MongoClient {
		return this.require_client();
	}

	getInstance(): Db {
		return this.require_db();
	}

	getDB(name: string): Db {
		return this.require_client().db(name);
	}

	async close(): Promise<void> {
		if (this.client) {
			await this.client.close().catch((err) => {
				log.error(err, 'Error closing MongoDB connection');
			});
		}
		this.client = null;
		this.db = null;
		this.init_promise = null;
		log.info('MongoDB connection closed');
	}
}
