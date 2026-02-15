// lib/core/mongodb.connector.ts

import { log } from '@rniverse/utils';
import { closeMongoDB, initMongoDB } from '@tools/mongodb.tool';
import {
	type Db,
	type BulkWriteOptions,
	type Collection,
	type Document,
	type Filter,
	type FindOptions,
	type MongoClient,
	type OptionalUnlessRequiredId,
	type UpdateFilter,
} from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

export class MongoDBConnector {
	private db: Db | null = null;
	private client: MongoClient | null = null;
	private config: MongoDBConnectorConfig;
	private init_promise: Promise<void> | null = null;

	constructor(config: MongoDBConnectorConfig) {
		this.config = config;
	}

	/**
	 * Connect to MongoDB. Safe to call multiple times — subsequent calls
	 * return the same promise. Must be awaited before using any operations.
	 */
	async connect(): Promise<void> {
		if (!this.init_promise) {
			this.init_promise = this.__connect();
		}
		return this.init_promise;
	}

	private async __connect(): Promise<void> {
		try {
			const { client, db } = await initMongoDB(this.config);
			this.client = client;
			this.db = db;
		} catch (error) {
			this.init_promise = null; // allow retry on failure
			log.error({ error }, 'Failed to initialize MongoDB connector');
			throw error;
		}
	}

	private require_db(): Db {
		if (!this.db) throw new Error('MongoDB not connected — call connect() first');
		return this.db;
	}

	private require_client(): MongoClient {
		if (!this.client) throw new Error('MongoDB not connected — call connect() first');
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
		return this.ping();
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

	getCollection<T extends Document = Document>(name: string, opts?: { db: string | Db }): Collection<T> {
		if (opts?.db) {
			const target = typeof opts.db === 'string' ? this.getDB(opts.db) : opts.db;
			return target.collection<T>(name);
		}
		return this.require_db().collection<T>(name);
	}

	// CRUD Operations
	async findOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		options?: FindOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.findOne(filter, options);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB findOne failed');
			return { ok: false as const, error: err };
		}
	}

	async find<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T> = {},
		options?: FindOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.find(filter, options).toArray();
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB find failed');
			return { ok: false as const, error: err };
		}
	}

	async insertOne<T extends Document = Document>(
		collectionName: string,
		document: OptionalUnlessRequiredId<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.insertOne(document);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB insertOne failed');
			return { ok: false as const, error: err };
		}
	}

	async insertMany<T extends Document = Document>(
		collectionName: string,
		documents: OptionalUnlessRequiredId<T>[],
		options?: BulkWriteOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.insertMany(documents, options);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB insertMany failed');
			return { ok: false as const, error: err };
		}
	}

	async updateOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		update: UpdateFilter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.updateOne(filter, update);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB updateOne failed');
			return { ok: false as const, error: err };
		}
	}

	async updateMany<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		update: UpdateFilter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.updateMany(filter, update);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB updateMany failed');
			return { ok: false as const, error: err };
		}
	}

	async deleteOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.deleteOne(filter);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB deleteOne failed');
			return { ok: false as const, error: err };
		}
	}

	async deleteMany<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.deleteMany(filter);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB deleteMany failed');
			return { ok: false as const, error: err };
		}
	}

	async countDocuments<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T> = {},
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.countDocuments(filter);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB countDocuments failed');
			return { ok: false as const, error: err };
		}
	}

	async aggregate<T extends Document = Document>(
		collectionName: string,
		pipeline: Document[],
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.aggregate(pipeline).toArray();
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB aggregate failed');
			return { ok: false as const, error: err };
		}
	}

	async createIndex<T extends Document = Document>(
		collectionName: string,
		indexSpec: Document,
		options?: Document,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const data = await collection.createIndex(indexSpec, options);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB createIndex failed');
			return { ok: false as const, error: err };
		}
	}

	async listCollections() {
		try {
			const db = this.require_db();
			const data = await db.listCollections().toArray();
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err }, 'MongoDB listCollections failed');
			return { ok: false as const, error: err };
		}
	}

	async dropCollection(collectionName: string) {
		try {
			const db = this.require_db();
			await db.dropCollection(collectionName);
			log.info({ collection: collectionName }, 'Collection dropped');
			return { ok: true as const };
		} catch (err) {
			log.error({ error: err, collection: collectionName }, 'MongoDB dropCollection failed');
			return { ok: false as const, error: err };
		}
	}

	async close(): Promise<void> {
		if (this.client) {
			await closeMongoDB(this.client);
			this.client = null;
			this.db = null;
			this.init_promise = null;
		}
	}
}
