// lib/test/sql-connector.test.ts
// Connector-lifecycle behaviour (not SQL operations — see sql.test.ts for those).

import { afterEach, describe, expect, test } from 'bun:test';
import { SQLConnector } from '@core/sql.connector';

const URL =
	process.env.POSTGRES_TEST_URL ||
	'postgres://tester:tester@localhost:55433/tester';

const appNameOf = async (c: SQLConnector) => {
	const rows = await c.getInstance()
		.$client`SELECT current_setting('application_name') AS name`;
	return (rows[0] as { name: string }).name;
};

describe('SQLConnector lifecycle', () => {
	const original = process.env.INSTANCE_NAME;
	let connector: SQLConnector | undefined;

	afterEach(async () => {
		await connector?.close();
		connector = undefined;
		if (original === undefined) delete process.env.INSTANCE_NAME;
		else process.env.INSTANCE_NAME = original;
	});

	test('concurrent + repeated connect() calls all resolve', async () => {
		connector = new SQLConnector({ url: URL });
		await Promise.all([connector.connect(), connector.connect()]);
		await connector.connect(); // already connected — no-op
		expect((await connector.health()).ok).toBe(true);
	});

	test('operations throw before connect(), work after, throw after close()', async () => {
		connector = new SQLConnector({ url: URL });
		expect(() => connector!.getInstance()).toThrow(/not connected/);
		await connector.connect();
		expect(connector.getInstance()).toBeDefined();
		await connector.close();
		expect(() => connector!.getInstance()).toThrow(/not connected/);
		connector = new SQLConnector({ url: URL }); // afterEach closes this one
	});

	test('reconnects after close()', async () => {
		connector = new SQLConnector({ url: URL });
		await connector.connect();
		await connector.close();
		await connector.connect();
		const h = await connector.health();
		expect(h.ok).toBe(true);
	});

	test('a failed connect() rejects and leaves the connector unusable', async () => {
		connector = new SQLConnector({
			url: 'postgres://nope:nope@127.0.0.1:5433/nope',
			connectionTimeout: 2,
		});
		await expect(connector.connect()).rejects.toThrow();
		expect(() => connector!.getInstance()).toThrow(/not connected/);
		connector = undefined; // nothing to close
	});

	describe('application_name', () => {
		test('uses config.appName', async () => {
			connector = new SQLConnector({ url: URL, appName: 'svc-a' });
			await connector.connect();
			expect(await appNameOf(connector)).toBe('svc-a');
		});

		test('falls back to INSTANCE_NAME', async () => {
			process.env.INSTANCE_NAME = 'svc-env';
			connector = new SQLConnector({ url: URL });
			await connector.connect();
			expect(await appNameOf(connector)).toBe('svc-env');
		});

		test('defaults to "connectors"', async () => {
			delete process.env.INSTANCE_NAME;
			connector = new SQLConnector({ url: URL });
			await connector.connect();
			expect(await appNameOf(connector)).toBe('connectors');
		});
	});

	describe('circuit breaker', () => {
		test('is "closed" while healthy', async () => {
			connector = new SQLConnector({ url: URL });
			await connector.connect();
			expect(connector.circuit).toBe('closed');
			await connector.health();
			expect(connector.circuit).toBe('closed');
		});

		test('opens and releases the pool once health() fails past the threshold', async () => {
			process.env.CIRCUIT_THRESHOLD = '1';
			connector = new SQLConnector({ url: URL });
			await connector.connect();
			// Kill the pool underneath so ping() fails.
			await connector.getInstance().$client.end({ timeout: 1 });
			const h = await connector.health();
			expect(h.ok).toBe(false);
			expect(connector.circuit).not.toBe('closed');
			expect(() => connector!.getInstance()).toThrow(/not connected/);
			delete process.env.CIRCUIT_THRESHOLD;
		});

		test('health() reconnects on its own once the cooldown passes', async () => {
			connector = new SQLConnector({
				url: URL,
				health: { threshold: 1, cooldown: 50, attempts: 1 },
			});
			await connector.connect();
			await connector.getInstance().$client.end({ timeout: 1 });
			expect((await connector.health()).ok).toBe(false);
			expect(connector.circuit).toBe('open');

			await new Promise((resolve) => setTimeout(resolve, 70));
			expect((await connector.health()).ok).toBe(true); // trial reconnected
			expect(connector.circuit).toBe('closed');
			expect(connector.getInstance()).toBeDefined();
		});
	});

	describe('manual control', () => {
		test('health({ trial: true }) reconnects now instead of waiting out the cooldown', async () => {
			connector = new SQLConnector({
				url: URL,
				health: { threshold: 1, cooldown: 60_000, attempts: 1 },
			});
			await connector.connect();
			await connector.getInstance().$client.end({ timeout: 1 });
			await connector.health();
			expect(connector.circuit).toBe('open');
			expect(connector.breaker.remaining).toBeGreaterThan(50_000);

			expect((await connector.health({ trial: true })).ok).toBe(true);
			expect(connector.circuit).toBe('closed');
		});

		test('breaker.open({ ms }) makes health() fail fast; reset() lets it through', async () => {
			connector = new SQLConnector({ url: URL, health: { attempts: 1 } });
			await connector.connect();
			connector.breaker.open({ ms: 60_000 });
			const refused = await connector.health();
			expect(refused.ok).toBe(false);
			connector.breaker.reset();
			expect((await connector.health()).ok).toBe(true);
		});
	});

	describe('close() during connect()', () => {
		test('the in-flight connect is discarded, not revived', async () => {
			connector = new SQLConnector({ url: URL });
			const pending = connector.connect();
			await connector.close();
			await expect(pending).rejects.toThrow(/closed while connecting/);
			expect(() => connector!.getInstance()).toThrow(/not connected/);

			await connector.connect(); // a fresh connect still works
			expect(connector.getInstance()).toBeDefined();
		});
	});
});
