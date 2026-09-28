// test/postgres/connector.test.ts
// Connector + listener lifecycle (queries live in queries.test.ts / drizzle.test.ts).

import { afterEach, describe, expect, test } from 'bun:test';
import { PostgresConnector } from '@core/postgres';
import { sleep } from '@rniverse/utils/generic';
import { LinkError } from '@shared/errors';
import { eq } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';

const URL =
	process.env.POSTGRES_TEST_URL ||
	'postgres://tester:tester@localhost:55433/tester';

const appNameOf = async (c: PostgresConnector) => {
	const rows = await c.getInstance()
		.$client`SELECT current_setting('application_name') AS name`;
	return (rows[0] as { name: string }).name;
};

/** Wait until `check` holds, or fail after `ms`. */
async function until(check: () => boolean, ms = 3_000) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > ms) throw new Error('until: timed out');
		await sleep(20);
	}
}

describe('PostgresConnector', () => {
	const original = process.env.INSTANCE_NAME;
	let connector: PostgresConnector | undefined;

	afterEach(async () => {
		await connector?.close();
		connector = undefined;
		if (original === undefined) delete process.env.INSTANCE_NAME;
		else process.env.INSTANCE_NAME = original;
	});

	test('concurrent + repeated connect() calls resolve; ready, healthy', async () => {
		connector = new PostgresConnector({ name: 'pg', url: URL });
		await Promise.all([connector.connect(), connector.connect()]);
		await connector.connect();
		expect(connector.state).toBe('ready');
		expect((await connector.health()).ok).toBe(true);
	});

	test('url and fields combine — fields override the URL, never parsed out of it', async () => {
		connector = new PostgresConnector({
			name: 'pg',
			url: 'postgres://tester:WRONG@localhost:55433/tester',
			password: 'tester', // overrides the URL's wrong password
		});
		await connector.connect();
		expect(connector.state).toBe('ready');
	});

	test('fields only, no url', async () => {
		connector = new PostgresConnector({
			name: 'pg',
			host: 'localhost',
			port: 55433,
			database: 'tester',
			user: 'tester',
			password: 'tester',
		});
		await connector.connect();
		expect(connector.state).toBe('ready');
	});

	test('a failed connect → failed, getInstance throws NOT_READY', async () => {
		const events: string[] = [];
		connector = new PostgresConnector({
			name: 'pg',
			url: 'postgres://nope:nope@127.0.0.1:5433/nope',
			pool: { connectionTimeout: 2 },
			on: { fail: () => events.push('fail') },
		});
		await expect(connector.connect()).rejects.toThrow();
		expect(connector.state).toBe('failed');
		expect(events).toEqual(['fail']);
		expect(() => connector!.getInstance()).toThrow(LinkError);
	});

	describe('application_name', () => {
		test('uses config.appName', async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				appName: 'svc-a',
			});
			await connector.connect();
			expect(await appNameOf(connector)).toBe('svc-a');
		});

		test('falls back to INSTANCE_NAME', async () => {
			process.env.INSTANCE_NAME = 'svc-env';
			connector = new PostgresConnector({ name: 'pg', url: URL });
			await connector.connect();
			expect(await appNameOf(connector)).toBe('svc-env');
		});

		test('neither set → MISSING_APP_NAME at construction', () => {
			delete process.env.INSTANCE_NAME;
			expect(() => new PostgresConnector({ name: 'pg', url: URL })).toThrow(
				LinkError,
			);
		});
	});

	describe('health + breaker', () => {
		test('opens and releases the pool once checks fail; recovers after the cooldown', async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				health: { threshold: 1, cooldown: 50, attempts: 1 },
			});
			await connector.connect();
			await connector.getInstance().$client.end({ timeout: 1 }); // kill the pool underneath
			expect((await connector.health()).ok).toBe(false);
			expect(connector.circuit).toBe('open');
			expect(connector.state).toBe('failed');
			expect(() => connector!.getInstance()).toThrow(LinkError);

			await sleep(70);
			expect((await connector.health()).ok).toBe(true); // the trial reconnected
			expect(connector.state).toBe('ready');
		});

		test('health({ trial: true }) reconnects now', async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				health: { threshold: 1, cooldown: 60_000, attempts: 1 },
			});
			await connector.connect();
			await connector.getInstance().$client.end({ timeout: 1 });
			await connector.health();
			expect((await connector.health({ trial: true })).ok).toBe(true);
			expect(connector.circuit).toBe('closed');
		});
	});

	describe('schema', () => {
		const notes = pgTable('connector_schema_notes', {
			id: integer('id').primaryKey(),
			body: text('body').notNull(),
		});

		test('enables relational queries (db.query.*)', async () => {
			const typed = new PostgresConnector({
				name: 'pg',
				url: URL,
				schema: { notes },
			});
			connector = typed; // afterEach closes it
			await typed.connect();
			const db = typed.getInstance();
			await db.$client`DROP TABLE IF EXISTS connector_schema_notes`;
			await db.$client`CREATE TABLE connector_schema_notes (id int primary key, body text not null)`;
			await db.insert(notes).values({ id: 1, body: 'hello' });
			const found = await db.query.notes.findFirst({ where: eq(notes.id, 1) });
			expect(found).toEqual({ id: 1, body: 'hello' });
			await db.$client`DROP TABLE connector_schema_notes`;
		});
	});

	describe('listen()', () => {
		test('receives NOTIFY — JSON parsed, anything else as the raw string', async () => {
			connector = new PostgresConnector({ name: 'pg', url: URL });
			await connector.connect();
			const received: unknown[] = [];
			const listener = connector.listen({
				name: 'events',
				channel: 'connector_test_events',
				onMessage: (payload) => received.push(payload),
			});
			await listener.connect();
			expect(listener.state).toBe('ready');

			const sql = connector.getInstance().$client;
			await sql.notify('connector_test_events', JSON.stringify({ a: 1 }));
			await sql.notify('connector_test_events', 'plain text');
			await until(() => received.length === 2);
			expect(received).toEqual([{ a: 1 }, 'plain text']);
		});

		test('listeners are tracked by name; duplicates throw; close frees the name', async () => {
			connector = new PostgresConnector({ name: 'pg', url: URL });
			await connector.connect();
			const first = connector.listen({
				name: 'x',
				channel: 'c1',
				onMessage: () => {},
			});
			expect(connector.listeners.get('x')).toBe(first);
			expect(() =>
				connector!.listen({ name: 'x', channel: 'c2', onMessage: () => {} }),
			).toThrow(LinkError);
			await first.close();
			expect(connector.listeners.has('x')).toBe(false);
		});

		test('connect() before the connector is connected → NOT_READY', async () => {
			connector = new PostgresConnector({ name: 'pg', url: URL });
			const listener = connector.listen({
				name: 'x',
				channel: 'c',
				onMessage: () => {},
			});
			await expect(listener.connect()).rejects.toBeInstanceOf(LinkError);
		});

		test('closing the connector closes its listeners (and stops delivery)', async () => {
			connector = new PostgresConnector({ name: 'pg', url: URL });
			await connector.connect();
			const listener = connector.listen({
				name: 'x',
				channel: 'c',
				onMessage: () => {},
			});
			await listener.connect();
			await connector.close();
			expect(listener.state).toBe('closed');
			connector = undefined;
		});

		test("the connector's breaker releasing it fails its listeners; they reconnect on connect()", async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				health: { threshold: 1, cooldown: 60_000, attempts: 1 },
			});
			await connector.connect();
			const received: unknown[] = [];
			const listener = connector.listen({
				name: 'x',
				channel: 'connector_test_recover',
				onMessage: (p) => received.push(p),
			});
			await listener.connect();

			connector.breaker.open({ ms: 60_000 });
			await until(() => listener.state === 'failed');
			expect(connector.state).toBe('failed');

			connector.breaker.reset();
			await connector.connect();
			await listener.connect();
			expect(listener.state).toBe('ready');
			await connector
				.getInstance()
				.$client.notify('connector_test_recover', '"back"');
			await until(() => received.length === 1);
			expect(received).toEqual(['back']);
		});
	});
});
