// lib/core/mongodb.connector.ts

import { log } from '@rniverse/utils';
import { closeMongoDB, initMongoDB } from '@tools/mongodb.tool';
import type {
	BulkWriteOptions,
	Collection,
	Db,
	Document,
	Filter,
	FindOptions,
	MongoClient,
	OptionalUnlessRequiredId,
	UpdateFilter,
} from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

export class MongoDBConnector {
	private db: Db | null = null;
	private client: MongoClient | null = null;
	private config: MongoDBConnectorConfig;

	constructor(config: MongoDBConnectorConfig) {
		this.config = config;
		this.initialize();
	}

	private async initialize() {
		try {
			const { client, db } = await initMongoDB(this.config);
			this.client = client;
			this.db = db;
		} catch (error) {
			log.error(
				`Failed to initialize MongoDB connector: ${JSON.stringify(error)}`,
			);
			throw error;
		}
	}

	async ping() {
		log.info('Pinging MongoDB...');
		try {
			if (!this.db) {
				const { client, db } = await initMongoDB(this.config);
				this.client = client;
				this.db = db;
			}
			const result = await this.db.admin().ping();
			log.info('MongoDB ping successful');
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB ping failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async health() {
		return this.ping();
	}

	getClientInstance() {
		return this.client;
	}

	getInstance(): Db | null {
		return this.db;
	}

	getCollection<T extends Document = Document>(name: string): Collection<T> {
		const db = this.getInstance();
		if (!db) throw new Error('Database not initialized');
		return db.collection<T>(name);
	}

	// CRUD Operations
	async findOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		options?: FindOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.findOne(filter, options);
			return { ok: true, data: result };
		} catch (err) {
			log.error(`MongoDB findOne failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async find<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T> = {},
		options?: FindOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.find(filter, options).toArray();
			return { ok: true, data: result };
		} catch (err) {
			log.error(`MongoDB find failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async insertOne<T extends Document = Document>(
		collectionName: string,
		document: OptionalUnlessRequiredId<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.insertOne(document);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB insertOne failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async insertMany<T extends Document = Document>(
		collectionName: string,
		documents: OptionalUnlessRequiredId<T>[],
		options?: BulkWriteOptions,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.insertMany(documents, options);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB insertMany failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async updateOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		update: UpdateFilter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.updateOne(filter, update);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB updateOne failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async updateMany<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
		update: UpdateFilter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.updateMany(filter, update);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB updateMany failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async deleteOne<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.deleteOne(filter);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB deleteOne failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async deleteMany<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T>,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.deleteMany(filter);
			return { ok: true, result };
		} catch (err) {
			log.error(`MongoDB deleteMany failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async countDocuments<T extends Document = Document>(
		collectionName: string,
		filter: Filter<T> = {},
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const count = await collection.countDocuments(filter);
			return { ok: true, count };
		} catch (err) {
			log.error(`MongoDB countDocuments failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async aggregate<T extends Document = Document>(
		collectionName: string,
		pipeline: Document[],
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.aggregate(pipeline).toArray();
			return { ok: true, data: result };
		} catch (err) {
			log.error(`MongoDB aggregate failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async createIndex<T extends Document = Document>(
		collectionName: string,
		indexSpec: Document,
		options?: Document,
	) {
		try {
			const collection = this.getCollection<T>(collectionName);
			const result = await collection.createIndex(indexSpec, options);
			return { ok: true, indexName: result };
		} catch (err) {
			log.error(`MongoDB createIndex failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async listCollections() {
		try {
			const db = this.getInstance();
			if (!db) throw new Error('Database not initialized');
			const collections = await db.listCollections().toArray();
			return { ok: true, collections };
		} catch (err) {
			log.error(`MongoDB listCollections failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async dropCollection(collectionName: string) {
		try {
			const db = this.getInstance();
			if (!db) throw new Error('Database not initialized');
			await db.dropCollection(collectionName);
			log.info(`Collection ${collectionName} dropped`);
			return { ok: true };
		} catch (err) {
			log.error(`MongoDB dropCollection failed: ${JSON.stringify(err)}`);
			return { ok: false, error: err };
		}
	}

	async close() {
		if (this.client) {
			await closeMongoDB(this.client);
			this.client = null;
			this.db = null;
		}
	}
}
