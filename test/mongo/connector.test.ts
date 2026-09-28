// test/mongo/connector.test.ts

import { afterEach, describe, expect, test } from 'bun:test';
import { MongoConnector } from '@core/mongo';
import { LinkError } from '@shared/errors';

const URL = process.env.MONGODB_TEST_URL || 'mongodb://localhost:57017/testdb';

describe('MongoConnector', () => {
	let connector: MongoConnector | undefined;
	afterEach(async () => {
		await connector?.close();
		connector = undefined;
	});

	test('connects; getInstance() is the MongoClient; healthy', async () => {
		connector = new MongoConnector({ name: 'mongo', url: URL });
		await connector.connect();
		expect(connector.state).toBe('ready');
		expect(typeof connector.getInstance().db).toBe('function');
		expect((await connector.health()).ok).toBe(true);
	});

	test('db(name) — many databases on one pool; default from config, else the URL', async () => {
		connector = new MongoConnector({
			name: 'mongo',
			url: URL,
			database: 'configured',
		});
		await connector.connect();
		expect(connector.db().databaseName).toBe('configured');
		expect(connector.db('reports').databaseName).toBe('reports');
		expect(connector.db('reports').client).toBe(connector.getInstance());

		const fromUrl = new MongoConnector({ name: 'url-db', url: URL });
		await fromUrl.connect();
		expect(fromUrl.db().databaseName).toBe('testdb');
		await fromUrl.close();
	});

	test('sends appName to the server', async () => {
		connector = new MongoConnector({
			name: 'mongo',
			url: URL,
			appName: 'svc-mongo',
		});
		await connector.connect();
		const status = await connector.db('admin').command({ connectionStatus: 1 });
		expect(status.ok).toBe(1);
		expect(connector.getInstance().options.appName).toBe('svc-mongo');
	});

	test('a failed connect → failed, NOT_READY afterwards', async () => {
		connector = new MongoConnector({
			name: 'mongo',
			url: 'mongodb://127.0.0.1:1/x',
			options: { serverSelectionTimeoutMS: 500, connectTimeoutMS: 500 },
		});
		await expect(connector.connect()).rejects.toThrow();
		expect(connector.state).toBe('failed');
		expect(() => connector!.db()).toThrow(LinkError);
	});

	test('close → closed; connect again works', async () => {
		connector = new MongoConnector({ name: 'mongo', url: URL });
		await connector.connect();
		await connector.close();
		expect(connector.state).toBe('closed');
		await connector.connect();
		expect(connector.state).toBe('ready');
	});
});
