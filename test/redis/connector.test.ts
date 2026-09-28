// test/redis/connector.test.ts

import { afterEach, describe, expect, test } from 'bun:test';
import { RedisConnector } from '@core/redis';
import { sleep } from '@rniverse/utils/generic';
import { LinkError } from '@shared/errors';
import { TimeUnit } from '@valkey/valkey-glide';

const HOST = process.env.REDIS_HOST || 'localhost';
const PORT = Number(process.env.REDIS_PORT || 56379);

async function until(check: () => boolean, ms = 3_000) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > ms) throw new Error('until: timed out');
		await sleep(20);
	}
}

describe('RedisConnector', () => {
	let connector: RedisConnector | undefined;
	afterEach(async () => {
		await connector?.close();
		connector = undefined;
	});

	const make = (
		extra: Partial<ConstructorParameters<typeof RedisConnector>[0]> = {},
	) => new RedisConnector({ name: 'cache', host: HOST, port: PORT, ...extra });

	test('connects; getInstance() is the GlideClient itself', async () => {
		connector = make();
		await connector.connect();
		expect(connector.state).toBe('ready');
		const glide = connector.getInstance();
		await glide.set('connector:key', 'value', {
			expiry: { type: TimeUnit.Seconds, count: 60 },
		});
		expect(await glide.get('connector:key')).toBe('value');
		expect(await glide.del(['connector:key'])).toBe(1);
		expect((await connector.health()).ok).toBe(true);
	});

	test('sets CLIENT SETNAME from appName', async () => {
		connector = make({ appName: 'svc-redis' });
		await connector.connect();
		expect(await connector.getInstance().clientGetName()).toBe('svc-redis');
	});

	test('database selects the logical DB', async () => {
		connector = make({ database: 3 });
		await connector.connect();
		const glide = connector.getInstance();
		await glide.set('connector:db', '3');
		const other = make({ name: 'other', database: 0 });
		await other.connect();
		expect(await other.getInstance().get('connector:db')).toBeNull();
		await other.close();
		await glide.del(['connector:db']);
	});

	test('a failed connect → failed, NOT_READY afterwards', async () => {
		connector = make({ port: 1, connectionTimeout: 500, requestTimeout: 500 });
		await expect(connector.connect()).rejects.toThrow();
		expect(connector.state).toBe('failed');
		expect(() => connector!.getInstance()).toThrow(LinkError);
	});

	describe('subscriber()', () => {
		test('receives PUBLISH on channels and patterns', async () => {
			connector = make();
			await connector.connect();
			const received: unknown[] = [];
			const sub = connector.subscriber({
				name: 'events',
				channels: ['connector:events'],
				patterns: ['connector:p:*'],
				onMessage: (m) => received.push(m),
			});
			await sub.connect();
			expect(sub.state).toBe('ready');

			const glide = connector.getInstance();
			await sleep(200); // let the SUBSCRIBE settle server-side
			await glide.publish('hello', 'connector:events');
			await glide.publish('world', 'connector:p:one');
			await until(() => received.length === 2);
			expect(received).toContainEqual({
				channel: 'connector:events',
				message: 'hello',
			});
			expect(received).toContainEqual({
				channel: 'connector:p:one',
				pattern: 'connector:p:*',
				message: 'world',
			});
		});

		test('tracked by name; duplicates throw; close frees the name', async () => {
			connector = make();
			await connector.connect();
			const first = connector.subscriber({
				name: 's',
				channels: ['a'],
				onMessage: () => {},
			});
			expect(connector.subscribers.get('s')).toBe(first);
			expect(() =>
				connector!.subscriber({
					name: 's',
					channels: ['b'],
					onMessage: () => {},
				}),
			).toThrow(LinkError);
			await first.close();
			expect(connector.subscribers.has('s')).toBe(false);
		});

		test('connect() before the connector is connected → NOT_READY', async () => {
			connector = make();
			const sub = connector.subscriber({
				name: 's',
				channels: ['a'],
				onMessage: () => {},
			});
			await expect(sub.connect()).rejects.toBeInstanceOf(LinkError);
		});

		test("the connector's breaker releasing it fails its subscribers; closing it closes them", async () => {
			connector = make({
				health: { threshold: 1, cooldown: 60_000, attempts: 1 },
			});
			await connector.connect();
			const sub = connector.subscriber({
				name: 's',
				channels: ['a'],
				onMessage: () => {},
			});
			await sub.connect();
			connector.breaker.open({ ms: 60_000 });
			await until(() => sub.state === 'failed');
			connector.breaker.reset();
			await connector.connect();
			await sub.connect();
			expect(sub.state).toBe('ready');
			await connector.close();
			expect(sub.state).toBe('closed');
			connector = undefined;
		});
	});
});
