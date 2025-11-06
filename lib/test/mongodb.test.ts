// lib/test/mongodb.test.ts

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MongoDBConnector } from '@core/mongodb.connector';
import { log } from '@rniverse/utils';

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
	const testCollectionPrefix = `test_${Date.now()}`;
	const usersCollection = `${testCollectionPrefix}_users`;
	const productsCollection = `${testCollectionPrefix}_products`;
	const ordersCollection = `${testCollectionPrefix}_orders`;

	beforeAll(async () => {
		connector = new MongoDBConnector({
			url: process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017/testdb',
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Seed data
		await connector.insertMany<User>(usersCollection, [
			{ username: 'alice', email: 'alice@example.com', age: 25 },
			{ username: 'bob', email: 'bob@example.com', age: 30 },
			{ username: 'charlie', email: 'charlie@example.com', age: 35 },
		]);

		await connector.insertMany<Product>(productsCollection, [
			{ name: 'Laptop', category: 'Electronics', price: 999.99, stock: 10 },
			{ name: 'Mouse', category: 'Electronics', price: 29.99, stock: 50 },
			{ name: 'Desk', category: 'Furniture', price: 299.99, stock: 5 },
		]);

		log.info('MongoDB test data seeded');
	});

	afterAll(async () => {
		await connector.dropCollection(usersCollection);
		await connector.dropCollection(productsCollection);
		await connector.dropCollection(ordersCollection);
		await connector.close();
	});

	test('Health Check', async () => {
		const result = await connector.health();
		expect(result.ok).toBe(true);
	});

	test('INSERT - Single Document', async () => {
		const username = `testuser_${Date.now()}`;
		const result = await connector.insertOne<User>(usersCollection, {
			username,
			email: `${username}@test.com`,
			age: 28,
		});

		expect(result.ok).toBe(true);
		expect(result.result?.insertedId).toBeDefined();
	});

	test('INSERT - Multiple Documents', async () => {
		const timestamp = Date.now();
		const result = await connector.insertMany<User>(usersCollection, [
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

		expect(result.ok).toBe(true);
		expect(result.result?.insertedCount).toBe(2);
	});

	test('FIND - All Documents', async () => {
		const result = await connector.find<User>(usersCollection);

		expect(result.ok).toBe(true);
		expect(result.data).toBeDefined();
		expect(result.data?.length ?? 0).toBeGreaterThan(0);
	});

	test('FIND - With Filter', async () => {
		const result = await connector.find<User>(usersCollection, {
			username: 'alice',
		});

		expect(result.ok).toBe(true);
		expect(result.data?.length).toBe(1);
		expect(result.data?.[0]?.username).toBe('alice');
	});

	test('FIND - With Query Operators', async () => {
		const result = await connector.find<User>(usersCollection, {
			age: { $gt: 25 },
		});

		expect(result.ok).toBe(true);
		expect(result.data).toBeDefined();
		expect(result.data?.length ?? 0).toBeGreaterThan(0);
		expect(result.data?.every((user) => user.age > 25)).toBe(true);
	});

	test('FIND - With Projection and Sort', async () => {
		const result = await connector.find<User>(
			usersCollection,
			{},
			{ projection: { username: 1, age: 1 }, sort: { age: -1 }, limit: 2 },
		);

		expect(result.ok).toBe(true);
		expect(result.data?.length).toBeLessThanOrEqual(2);
		if (result.data && result.data.length > 1) {
			expect(result.data[0]?.age).toBeGreaterThanOrEqual(
				result.data[1]?.age ?? 0,
			);
		}
	});

	test('FINDONE - Single Document', async () => {
		const result = await connector.findOne<User>(usersCollection, {
			username: 'bob',
		});

		expect(result.ok).toBe(true);
		expect(result.data?.username).toBe('bob');
		expect(result.data?.age).toBe(30);
	});

	test('UPDATE - Single Document', async () => {
		const result = await connector.updateOne<User>(
			usersCollection,
			{ username: 'alice' },
			{ $set: { age: 26 } },
		);

		expect(result.ok).toBe(true);
		expect(result.result?.matchedCount).toBe(1);
		expect(result.result?.modifiedCount).toBe(1);

		const updated = await connector.findOne<User>(usersCollection, {
			username: 'alice',
		});
		expect(updated.data?.age).toBe(26);
	});

	test('UPDATE - Multiple Documents', async () => {
		const result = await connector.updateMany<User>(
			usersCollection,
			{ age: { $gte: 30 } },
			{ $inc: { age: 1 } },
		);

		expect(result.ok).toBe(true);
		expect(result.result?.matchedCount).toBeGreaterThan(0);
	});

	test('DELETE - Single Document', async () => {
		const username = `delete_user_${Date.now()}`;
		await connector.insertOne<User>(usersCollection, {
			username,
			email: `${username}@test.com`,
			age: 99,
		});

		const result = await connector.deleteOne<User>(usersCollection, {
			username,
		});

		expect(result.ok).toBe(true);
		expect(result.result?.deletedCount).toBe(1);

		const check = await connector.findOne<User>(usersCollection, { username });
		expect(check.data).toBeNull();
	});

	test('DELETE - Multiple Documents', async () => {
		const timestamp = Date.now();
		await connector.insertMany<User>(usersCollection, [
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

		const result = await connector.deleteMany<User>(usersCollection, {
			age: 99,
		});

		expect(result.ok).toBe(true);
		expect(result.result?.deletedCount).toBeGreaterThanOrEqual(2);
	});

	test('COUNT - Documents', async () => {
		const result = await connector.countDocuments<User>(usersCollection);

		expect(result.ok).toBe(true);
		expect(result.count).toBeGreaterThan(0);
	});

	test('COUNT - With Filter', async () => {
		const result = await connector.countDocuments<User>(usersCollection, {
			age: { $gte: 30 },
		});

		expect(result.ok).toBe(true);
		expect(typeof result.count).toBe('number');
	});

	test('AGGREGATE - Group By', async () => {
		const result = await connector.aggregate<Product>(productsCollection, [
			{
				$group: {
					_id: '$category',
					totalStock: { $sum: '$stock' },
					avgPrice: { $avg: '$price' },
					count: { $sum: 1 },
				},
			},
		]);

		expect(result.ok).toBe(true);
		expect(result.data).toBeDefined();
		expect(result.data?.length ?? 0).toBeGreaterThan(0);
	});

	test('AGGREGATE - Match and Project', async () => {
		const result = await connector.aggregate<Product>(productsCollection, [
			{ $match: { category: 'Electronics' } },
			{ $project: { name: 1, price: 1, category: 1 } },
			{ $sort: { price: -1 } },
		]);

		expect(result.ok).toBe(true);
		expect(result.data).toBeDefined();
		expect(result.data?.every((p: any) => p.category === 'Electronics')).toBe(
			true,
		);
	});

	test('AGGREGATE - Lookup (Join)', async () => {
		// Create orders that reference users
		const usersResult = await connector.find<User>(usersCollection, {
			username: 'alice',
		});
		if (usersResult.data && usersResult.data.length > 0) {
			const userId = usersResult.data[0]?._id?.toString();

			if (userId) {
				await connector.insertOne<Order>(ordersCollection, {
					userId,
					productName: 'Laptop',
					quantity: 1,
					price: 999.99,
				});

				const result = await connector.aggregate(ordersCollection, [
					{
						$lookup: {
							from: usersCollection,
							localField: 'userId',
							foreignField: '_id',
							as: 'userDetails',
						},
					},
					{ $limit: 10 },
				]);

				expect(result.ok).toBe(true);
				expect(result.data).toBeDefined();
			}
		}
	});

	test('CREATE INDEX', async () => {
		const result = await connector.createIndex<User>(
			usersCollection,
			{ email: 1 },
			{ unique: true, name: 'email_unique_idx' },
		);

		expect(result.ok).toBe(true);
		expect(result.indexName).toBeDefined();
	});

	test('LIST COLLECTIONS', async () => {
		const result = await connector.listCollections();

		expect(result.ok).toBe(true);
		expect(result.collections).toBeDefined();
		expect(Array.isArray(result.collections)).toBe(true);
	});

	test('BULK OPERATIONS - Complex Query', async () => {
		const timestamp = Date.now();

		// Insert multiple documents
		await connector.insertMany<User>(usersCollection, [
			{ username: `bulk1_${timestamp}`, email: `bulk1@test.com`, age: 20 },
			{ username: `bulk2_${timestamp}`, email: `bulk2@test.com`, age: 25 },
			{ username: `bulk3_${timestamp}`, email: `bulk3@test.com`, age: 30 },
		]);

		// Find with complex filter
		const result = await connector.find<User>(usersCollection, {
			$and: [{ email: { $regex: /bulk/ } }, { age: { $gte: 20, $lte: 30 } }],
		});

		expect(result.ok).toBe(true);
		expect(result.data?.length).toBeGreaterThanOrEqual(3);
	});

	test('UPSERT - Update or Insert', async () => {
		const username = `upsert_user_${Date.now()}`;
		const collection = connector.getCollection<User>(usersCollection);

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

		const check = await connector.findOne<User>(usersCollection, { username });
		expect(check.data?.age).toBe(30);
	});

	test('TEXT SEARCH - With Index', async () => {
		const searchCollection = `${testCollectionPrefix}_search`;

		// Create text index
		await connector.createIndex(searchCollection, {
			name: 'text',
			category: 'text',
		});

		// Insert searchable documents
		await connector.insertMany<Product>(searchCollection, [
			{ name: 'JavaScript Book', category: 'Books', price: 39.99, stock: 20 },
			{ name: 'TypeScript Guide', category: 'Books', price: 49.99, stock: 15 },
			{ name: 'Python Tutorial', category: 'Books', price: 29.99, stock: 25 },
		]);

		// Text search
		const result = await connector.find<Product>(searchCollection, {
			$text: { $search: 'JavaScript TypeScript' },
		});

		expect(result.ok).toBe(true);
		expect(result.data).toBeDefined();

		await connector.dropCollection(searchCollection);
	});

	test('CURSOR - Simple Iteration with forEach', async () => {
		const collection = connector.getCollection<User>(usersCollection);
		const users: User[] = [];

		// Create cursor and iterate
		const cursor = collection.find({ age: { $gte: 25 } });

		// Iterate using forEach
		await cursor.forEach((doc) => {
			users.push(doc);
		});

		expect(users.length).toBeGreaterThan(0);
		expect(users.every((u) => u.age >= 25)).toBe(true);
	});

	test('CURSOR - Manual Iteration with hasNext/next', async () => {
		const collection = connector.getCollection<Product>(productsCollection);
		const products: Product[] = [];

		// Create cursor with limit
		const cursor = collection.find({}).limit(2);

		// Manual iteration
		while (await cursor.hasNext()) {
			const doc = await cursor.next();
			if (doc) products.push(doc);
		}

		expect(products.length).toBe(2);
		expect(products[0]).toHaveProperty('name');
		await cursor.close();
	});

	test('CURSOR - Batch Processing with toArray', async () => {
		const collection = connector.getCollection<User>(usersCollection);

		// Process in batches of 2
		const cursor = collection.find({}).batchSize(2);
		const allUsers: User[] = [];

		// Process cursor in batches
		let hasMore = true;
		while (hasMore) {
			const batch = await cursor.toArray();
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
		const collection = connector.getCollection<Product>(productsCollection);
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
		const collection = connector.getCollection<User>(usersCollection);
		const users: User[] = [];

		// Create cursor with sort and limit
		const cursor = collection
			.find({ age: { $gte: 20 } })
			.sort({ age: -1 })
			.limit(3);

		// Iterate
		await cursor.forEach((doc) => {
			users.push(doc);
		});

		expect(users.length).toBeLessThanOrEqual(3);
		// Verify descending order
		for (let i = 1; i < users.length; i++) {
			expect(users[i - 1]?.age).toBeGreaterThanOrEqual(users[i]?.age ?? 0);
		}
	});
});
