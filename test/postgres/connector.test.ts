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
		});
		connector.on('fail', {
			name: 'test',
			handler: () => {
				events.push('fail');
			},
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
		test('the circuit opening keeps the pool; after the cooldown the trial pings it and it recovers', async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				health: { threshold: 1, cooldown: 50, attempts: 1 },
			});
			await connector.connect();
			const db = connector.getInstance();
			connector.breaker.open({ ms: 50 });
			expect(connector.state).toBe('failed');
			expect((await connector.health()).ok).toBe(false); // fails fast while open
			expect(connector.getInstance()).toBe(db);

			await sleep(70);
			expect((await connector.health()).ok).toBe(true);
			expect(connector.state).toBe('ready');
			expect(connector.getInstance()).toBe(db);
		});

		test("dropped server connections are the driver's to fix — same pool, healthy again", async () => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				appName: 'connector-test-dropped',
			});
			await connector.connect();
			const db = connector.getInstance();
			const admin = new PostgresConnector({ name: 'admin', url: URL });
			await admin.connect();
			await admin.getInstance()
				.$client`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'connector-test-dropped'`;
			await admin.close();

			expect((await connector.health()).ok).toBe(true);
			expect(connector.getInstance()).toBe(db);
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

	describe('listeners', () => {
		/** A connector with one declared listener that records its messages. */
		const listening = (options: { channel: string; health?: object }) => {
			connector = new PostgresConnector({
				name: 'pg',
				url: URL,
				listeners: [{ name: 'events', channel: options.channel }],
				...(options.health && { health: options.health }),
			});
			const listener = connector.listeners.get('events');
			const received: unknown[] = [];
			listener.on('message', {
				name: 'test',
				handler: (payload) => {
					received.push(payload);
				},
			});
			return { listener, received };
		};

		test('connects with its connector; message events — JSON parsed, anything else the raw string', async () => {
			const { listener, received } = listening({
				channel: 'connector_test_events',
			});
			await connector!.connect();
			await until(() => listener.state === 'ready');

			const sql = connector!.getInstance().$client;
			await sql.notify('connector_test_events', JSON.stringify({ a: 1 }));
			await sql.notify('connector_test_events', 'plain text');
			await until(() => received.length === 2);
			expect(received).toEqual([{ a: 1 }, 'plain text']);
		});

		test('looked up by name; an unknown name throws UNKNOWN_NAME', () => {
			const { listener } = listening({ channel: 'c1' });
			expect(listener.channel).toBe('c1');
			expect(connector!.listeners.size).toBe(1);
			expect(() => connector!.listeners.get('nope')).toThrow(LinkError);
		});

		test('connect() before the connector is ready waits — no throw, stays idle', async () => {
			const { listener } = listening({ channel: 'c' });
			await listener.connect();
			expect(listener.state).toBe('idle');
		});

		test('closing the connector closes its listeners', async () => {
			const { listener } = listening({ channel: 'c' });
			await connector!.connect();
			await until(() => listener.state === 'ready');
			await connector!.close();
			expect(listener.state).toBe('closed');
			connector = undefined;
		});

		test('the connector failing takes the listener down and back — same LISTEN, still delivering', async () => {
			const { listener, received } = listening({
				channel: 'connector_test_recover',
				health: { threshold: 1, cooldown: 60_000, attempts: 1 },
			});
			await connector!.connect();
			await until(() => listener.state === 'ready');

			connector!.breaker.open({ ms: 60_000 });
			expect(connector!.state).toBe('failed');
			expect(listener.state).toBe('failed');

			connector!.breaker.reset();
			expect((await connector!.health()).ok).toBe(true);
			expect(listener.state).toBe('ready');
			await connector!
				.getInstance()
				.$client.notify('connector_test_recover', '"back"');
			await until(() => received.length === 1);
			expect(received).toEqual(['back']);
		});
	});
});
