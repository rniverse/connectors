// lib/tools/mongodb.tool.ts

import { log } from '@rniverse/utils';
import { MongoClient } from 'mongodb';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

const defaultOptions = {
	maxPoolSize: 10,
	minPoolSize: 2,
	connectTimeoutMS: 10000,
	socketTimeoutMS: 45000,
	serverSelectionTimeoutMS: 10000,
	retryWrites: true,
	retryReads: true,
};

export async function initMongoDB(config: MongoDBConnectorConfig) {
	log.info('Initializing MongoDB client...');

	try {
		const options = { ...defaultOptions, ...config.options };

		const mongoClient = new MongoClient(config.url, options);
		await mongoClient.connect();

		// Extract database name from URL or use provided database name
		const dbName = config.database || extractDatabaseFromUrl(config.url);
		if (!dbName) {
			throw new Error('Database name not found in URL or config');
		}

		const database = mongoClient.db(dbName);

		// Test connection
		await database.admin().ping();
		log.info('MongoDB warm-up successful');

		return { client: mongoClient, db: database };
	} catch (error) {
		log.error(`Failed to initialize MongoDB: ${JSON.stringify(error)}`);
		throw error;
	}
}

function extractDatabaseFromUrl(url: string): string | null {
	try {
		// Extract database name from mongodb://host:port/database or mongodb+srv://host/database
		const match = url.match(/\/([^/?]+)(\?|$)/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

export async function closeMongoDB(client: MongoClient) {
	if (client) {
		await client.close();
		log.info('MongoDB connection closed');
	}
}
