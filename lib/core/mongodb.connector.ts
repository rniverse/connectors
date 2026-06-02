// lib/core/mongodb.connector.ts

import { log } from '@rniverse/utils';
import { initMongoDB } from '@tools/mongodb.tool';
import { sleep } from 'bun';
import type { Db, MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

export class MongoDBConnector {
	private db: Db | null = null;
	private client: MongoClient | null = null;
	private config: MongoDBConnectorConfig;
	private init_promise: Promise<Db> | null = null;

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
			return db;
		} catch (error) {
			this.init_promise = null; // allow retry on failure
			log.error({ error }, 'Failed to initialize MongoDB connector');
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

	async ping() {
		try {
			const db = this.require_db();
			const data = await db.admin().ping();
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err }, 'MongoDB ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health() {
		const maxRetries = Number(process.env.MAX_HEALTH_RETRIES ?? 3);
		let result: any = { ok: false };
		for (let i = 0; i < maxRetries && !result.ok; i++) {
			if (i > 0) {
				log.warn(
					`MongoDB health check failed, retrying... (${i}/${maxRetries})`,
				);
				await sleep(1000 * i);
			}
			result = await this.ping();
		}
		if (!result.ok) await this.close();
		return result;
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
				log.error({ error: err }, 'Error closing MongoDB connection');
			});
		}
		this.client = null;
		this.db = null;
		this.init_promise = null;
		log.info('MongoDB connection closed');
	}
}
