// lib/test/mongodb.test.ts

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MongoDBConnector } from '@core/mongodb.connector';
import { log } from '@rniverse/utils';
import { Db } from 'mongodb';

interface User {
	_id?: any;
	username: string;
	email: string;
	age: number;
	createdAt?: Date;
}

interface Product {
	_id?: any;
	name: string;
	category: string;
	price: number;
	stock: number;
}

interface Order {
	_id?: any;
	userId: string;
	productName: string;
	quantity: number;
	price: number;
	orderDate?: Date;
}

describe('MongoDB Connector Tests', () => {
	let connector: MongoDBConnector;
	let db: Db;
	const testCollectionPrefix = `test_${Date.now()}`;
	const usersCollection = `${testCollectionPrefix}_users`;
	const productsCollection = `${testCollectionPrefix}_products`;
	const ordersCollection = `${testCollectionPrefix}_orders`;

	beforeAll(async () => {
		connector = new MongoDBConnector({
			url: process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017/testdb',
			database: 'testdb',
		});
		db = await connector.connect();

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Seed data
		await db.collection(usersCollection).insertMany([
			{ username: 'alice', email: 'alice@example.com', age: 25 },
			{ username: 'bob', email: 'bob@example.com', age: 30 },
			{ username: 'charlie', email: 'charlie@example.com', age: 35 },
		]);

		await db.collection(productsCollection).insertMany([
			{ name: 'Laptop', category: 'Electronics', price: 999.99, stock: 10 },
			{ name: 'Mouse', category: 'Electronics', price: 29.99, stock: 50 },
			{ name: 'Desk', category: 'Furniture', price: 299.99, stock: 5 },
		]);

		log.info('MongoDB test data seeded');
	});

	afterAll(async () => {
		await db.collection(usersCollection).drop();
		await db.collection(productsCollection).drop();
		await db.collection(ordersCollection).drop();
		await connector.close();
	});

	test('Health Check', async () => {
		const result = await connector.health();
		expect(result.ok).toBe(true);
	});

	test('INSERT - Single Document', async () => {
		const username = `testuser_${Date.now()}`;
		const result = await db.collection(usersCollection).insertOne({
			username,
			email: `${username}@test.com`,
			age: 28,
		});

		expect(result?.insertedId).toBeDefined();
	});

	test('INSERT - Multiple Documents', async () => {
		const timestamp = Date.now();
		const result = await db.collection(usersCollection).insertMany([
			{
				username: `multi_user1_${timestamp}`,
				email: `multi1_${timestamp}@test.com`,
				age: 30,
			},
			{
				username: `multi_user2_${timestamp}`,
				email: `multi2_${timestamp}@test.com`,
				age: 35,
			},
		]);

		expect(result.insertedCount).toBe(2);
	});

	test('FIND - All Documents', async () => {
		const result = await db.collection(usersCollection).find().toArray();

		expect(result?.length ?? 0).toBeGreaterThan(0);
	});

	test('FIND - With Filter', async () => {
		const result = await db.collection(usersCollection).find({
			username: 'alice',
		}).toArray();

		expect(result?.length).toBe(1);
		expect(result?.[0]?.username).toBe('alice');
	});

	test('FIND - With Query Operators', async () => {
		const result = await db.collection(usersCollection).find({
			age: { $gt: 25 },
		}).toArray();

		expect(result?.length ?? 0).toBeGreaterThan(0);
		expect(result?.every((user) => user.age > 25)).toBe(true);
	});

	test('FIND - With Projection and Sort', async () => {
		const result = await db.collection(usersCollection).find(
			{},
			{ projection: { username: 1, age: 1 }, sort: { age: -1 }, limit: 2 },
		).toArray();
		expect(result?.length).toBeLessThanOrEqual(2);
		if (result && result.length > 1) {
			expect(result[0]?.age).toBeGreaterThanOrEqual(
				result[1]?.age ?? 0,
			);
		}
	});

	test('FINDONE - Single Document', async () => {
		const result = await db.collection(usersCollection).findOne({
			username: 'bob',
		});

		expect(result?.username).toBe('bob');
		expect(result?.age).toBe(30);
	});

	test('UPDATE - Single Document', async () => {
		const result = await db.collection(usersCollection).updateOne(
			{ username: 'alice' },
			{ $set: { age: 26 } },
		);

		expect(result.matchedCount).toBe(1);
		expect(result.modifiedCount).toBe(1);

		const updated = await db.collection(usersCollection).findOne({
			username: 'alice',
		});
		expect(updated?.age).toBe(26);
	});

	test('UPDATE - Multiple Documents', async () => {
		const result = await db.collection(usersCollection).updateMany(
			{ age: { $gte: 30 } },
			{ $inc: { age: 1 } },
		);

		expect(result.matchedCount).toBeGreaterThan(0);
		expect(result.modifiedCount).toBeGreaterThan(0);
	});

	test('DELETE - Single Document', async () => {
		const username = `delete_user_${Date.now()}`;
		await db.collection(usersCollection).insertOne({
			username,
			email: `${username}@test.com`,
			age: 99,
		});

		const result = await db.collection(usersCollection).deleteOne({
			username,
		});

		expect(result.deletedCount).toBe(1);

		const check = await db.collection(usersCollection).findOne({ username });
		expect(check).toBeNull();
	});

	test('DELETE - Multiple Documents', async () => {
		const timestamp = Date.now();
		await db.collection(usersCollection).insertMany([
			{
				username: `temp1_${timestamp}`,
				email: `temp1_${timestamp}@test.com`,
				age: 99,
			},
			{
				username: `temp2_${timestamp}`,
				email: `temp2_${timestamp}@test.com`,
				age: 99,
			},
		]);

		const result = await db.collection(usersCollection).deleteMany({
			age: 99,
		});

		expect(result.deletedCount).toBeGreaterThanOrEqual(2);
	});

	test('COUNT - Documents', async () => {
		const result = await db.collection(usersCollection).countDocuments();

		expect(result).toBeGreaterThan(0);
	});

	test('COUNT - With Filter', async () => {
		const result = await db.collection(usersCollection).countDocuments({
			age: { $gte: 30 },
		});

		expect(typeof result).toBe('number');
	});

	test('AGGREGATE - Group By', async () => {
		const result = await db.collection(productsCollection).aggregate([
			{
				$group: {
					_id: '$category',
					totalStock: { $sum: '$stock' },
					avgPrice: { $avg: '$price' },
					count: { $sum: 1 },
				},
			},
		]).toArray();

		expect(result.length).toBeGreaterThan(0);
	});

	test('AGGREGATE - Match and Project', async () => {
		const result = await db.collection(productsCollection).aggregate([
			{ $match: { category: 'Electronics' } },
			{ $project: { name: 1, price: 1, category: 1 } },
			{ $sort: { price: -1 } },
		]).toArray();

		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p: any) => p.category === 'Electronics')).toBe(
			true,
		);
	});

	test('AGGREGATE - Lookup (Join)', async () => {
		// Create orders that reference users
		const usersResult = await db.collection(usersCollection).find({
			username: 'alice',
		}).toArray();
		if (usersResult.length > 0) {
			const userId = usersResult[0]?._id?.toString();

			if (userId) {
				await db.collection(ordersCollection).insertOne({
					userId,
					productName: 'Laptop',
					quantity: 1,
					price: 999.99,
				});

				const result = await db.collection(ordersCollection).aggregate([
					{
						$lookup: {
							from: usersCollection,
							localField: 'userId',
							foreignField: '_id',
							as: 'userDetails',
						},
					},
					{ $limit: 10 },
				]).toArray();

				expect(result.length).toBeGreaterThan(0);
			}
		}
	});

	test('CREATE INDEX', async () => {
		const result = await db.collection(usersCollection).createIndex(
			{ email: 1 },
			{ unique: true, name: 'email_unique_idx' },
		);

		expect(result).toBeDefined();
	});

	test('LIST COLLECTIONS', async () => {
		const result = await db.listCollections().toArray();

		expect(result.length).toBeGreaterThan(0);
	});

	test('BULK OPERATIONS - Complex Query', async () => {
		const timestamp = Date.now();

		// Insert multiple documents
		await db.collection(usersCollection).insertMany([
			{ username: `bulk1_${timestamp}`, email: `bulk1@test.com`, age: 20 },
			{ username: `bulk2_${timestamp}`, email: `bulk2@test.com`, age: 25 },
			{ username: `bulk3_${timestamp}`, email: `bulk3@test.com`, age: 30 },
		]);

		// Find with complex filter
		const result = await db.collection(usersCollection).find({
			$and: [{ email: { $regex: /bulk/ } }, { age: { $gte: 20, $lte: 30 } }],
		}).toArray();

		expect(result.length).toBeGreaterThanOrEqual(3);
	});

	test('UPSERT - Update or Insert', async () => {
		const username = `upsert_user_${Date.now()}`;
		const collection = db.collection(usersCollection);

		// First upsert (insert)
		const result1 = await collection.updateOne(
			{ username },
			{ $set: { username, email: `${username}@test.com`, age: 25 } },
			{ upsert: true },
		);

		expect(result1.matchedCount + result1.upsertedCount).toBeGreaterThan(0);

		// Second upsert (update)
		const result2 = await collection.updateOne(
			{ username },
			{ $set: { age: 30 } },
			{ upsert: true },
		);

		expect(result2.matchedCount).toBe(1);

		const check = await db.collection(usersCollection).findOne({ username });
		expect(check?.age).toBe(30);
	});

	test('TEXT SEARCH - With Index', async () => {
		const searchCollection = `${testCollectionPrefix}_search`;

		// Create text index
		await db.collection(searchCollection).createIndex({
			name: 'text',
			category: 'text',
		});

		// Insert searchable documents
		await db.collection(searchCollection).insertMany([
			{ name: 'JavaScript Book', category: 'Books', price: 39.99, stock: 20 },
			{ name: 'TypeScript Guide', category: 'Books', price: 49.99, stock: 15 },
			{ name: 'Python Tutorial', category: 'Books', price: 29.99, stock: 25 },
		]);

		// Text search
		const result = await db.collection(searchCollection).find({
			$text: { $search: 'JavaScript TypeScript' },
		}).toArray();

		expect(result.length).toBeGreaterThan(0);

		await db.collection(searchCollection).drop();
	});

	test('CURSOR - Simple Iteration with forEach', async () => {
		const collection = db.collection(usersCollection);
		const users: User[] = [];

		// Create cursor and iterate
		const cursor = collection.find({ age: { $gte: 25 } });

		// Iterate using forEach
		for (let i = 0; i < 3; i++) {
			const doc = await cursor.next() as User;
			if (doc) users.push(doc);
		}

		expect(users.length).toBeGreaterThan(0);
		expect(users.every((u) => u.age >= 25)).toBe(true);
	});

	test('CURSOR - Manual Iteration with hasNext/next', async () => {
		const collection = db.collection(productsCollection);
		const products: Product[] = [];

		// Create cursor with limit
		const cursor = collection.find({}).limit(2);

		// Manual iteration
		while (await cursor.hasNext()) {
			const doc = await cursor.next() as Product;
			if (doc) products.push(doc);
		}

		expect(products.length).toBe(2);
		expect(products[0]).toHaveProperty('name');
		await cursor.close();
	});

	test('CURSOR - Batch Processing with toArray', async () => {
		const collection = db.collection(usersCollection);

		// Process in batches of 2
		const cursor = collection.find({}).batchSize(2);
		const allUsers: User[] = [];

		// Process cursor in batches
		let hasMore = true;
		while (hasMore) {
			const batch = await cursor.toArray() as User[];
			if (batch.length === 0) {
				hasMore = false;
			} else {
				allUsers.push(...batch);
				break; // toArray gets all results at once
			}
		}

		expect(allUsers.length).toBeGreaterThan(0);
		expect(allUsers[0]).toHaveProperty('username');
	});

	test('CURSOR - Stream Processing', async () => {
		const collection = db.collection(productsCollection);
		const processedProducts: string[] = [];

		// Create cursor stream
		const cursor = collection.find({});
		const stream = cursor.stream();

		// Process stream
		await new Promise<void>((resolve, reject) => {
			stream.on('data', (doc: Product) => {
				processedProducts.push(doc.name);
			});

			stream.on('end', () => {
				resolve();
			});

			stream.on('error', (err) => {
				reject(err);
			});
		});

		expect(processedProducts.length).toBeGreaterThan(0);
		expect(processedProducts).toContain('Laptop');
	});

	test('CURSOR - Complex Query with Sort and Limit', async () => {
		const collection = db.collection(usersCollection);
		const users: User[] = [];

		// Create cursor with sort and limit
		const cursor = collection
			.find({ age: { $gte: 20 } })
			.sort({ age: -1 })
			.limit(3);

		// Iterate
		for (let i = 0; i < 3; i++) {
			const doc = await cursor.next() as User;
			if (doc) users.push(doc);
		}

		expect(users.length).toBeLessThanOrEqual(3);
		// Verify descending order
		for (let i = 1; i < users.length; i++) {
			expect(users[i - 1]?.age).toBeGreaterThanOrEqual(users[i]?.age ?? 0);
		}
	});
});
