// lib/test/mongodb-multi-connection.test.ts
// Test to verify multiple MongoDB connections work correctly (no singleton)

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MongoDBConnector } from '@core/mongodb.connector';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';
import type { Db } from 'mongodb';
import { env } from 'bun';

describe('MongoDB Multi-Connection Tests', () => {
	let connector1: MongoDBConnector;
	let connector2: MongoDBConnector;
	const mongoUrl = env.MONGO_URL || 'mongodb://localhost:27017';
	let db1: Db;
	let db2: Db;

	const config1: MongoDBConnectorConfig = {
		url: `${mongoUrl}/test_db_1?authSource=admin`,
		database: 'test_db_1',
	};

	const config2: MongoDBConnectorConfig = {
		url: `${mongoUrl}/test_db_2?authSource=admin`,
		database: 'test_db_2',
	};

	beforeAll(async () => {
		// Create two separate MongoDB connectors to different databases
		connector1 = new MongoDBConnector(config1);
		connector2 = new MongoDBConnector(config2);

		// Wait for both to initialize
		await Promise.all([connector1.connect(), connector2.connect()]);
		db1 = connector1.getInstance();
		db2 = connector2.getInstance();
	});

	afterAll(async () => {
		// Clean up test collections
		await db1.collection('users').drop();
		await db2.collection('users').drop();

		// Close both connections
		await connector1.close();
		await connector2.close();
	});

	test('Two connectors should connect to different databases', async () => {
		expect(db1).not.toBeNull();
		expect(db2).not.toBeNull();
		expect(db1?.databaseName).toBe('test_db_1');
		expect(db2?.databaseName).toBe('test_db_2');
	});

	test('Data written to one database should not appear in the other', async () => {
		// Insert data into database 1
		await db1.collection('users').insertOne({ name: 'Alice', age: 30 });

		// Insert data into database 2
		await db2.collection('users').insertOne({ name: 'Bob', age: 25 });

		// Verify database 1 has only Alice
		const db1Result = await db1.collection('users').find({}).toArray();
		expect(db1Result.length).toBe(1);
		const alice = db1Result[0];
		expect(alice).toBeDefined();
		expect(alice?.name).toBe('Alice');

		// Verify database 2 has only Bob
		const db2Result = await db2.collection('users').find({}).toArray();
		expect(db2Result.length).toBe(1);
		const bob = db2Result[0];
		expect(bob).toBeDefined();
		expect(bob?.name).toBe('Bob');
	});

	test('Operations on one connector should not affect the other', async () => {
		// Count docs in both databases
		const count1Before = await db1.collection('users').countDocuments({});
		const count2Before = await db2.collection('users').countDocuments({});

		expect(count1Before).toBe(1);
		expect(count2Before).toBe(1);

		// Delete from database 1
		await db1.collection('users').deleteMany({});

		// Verify database 1 is empty
		const count1After = await db1.collection('users').countDocuments({});
		expect(count1After).toBe(0);

		// Verify database 2 still has data
		const count2After = await db2.collection('users').countDocuments({});
		expect(count2After).toBe(1);
	});
});
