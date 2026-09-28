// test/kafka/connector.test.ts

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';
import { KafkaConnector } from '@core/kafka';
import { sleep } from '@rniverse/utils/generic';
import { LinkError } from '@shared/errors';

const BROKERS = process.env.REDPANDA_URL || 'localhost:59092';
const TOPIC = `connector-lifecycle-${Date.now()}`;

async function until(check: () => boolean, ms = 15_000) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > ms) throw new Error('until: timed out');
		await sleep(50);
	}
}

describe('KafkaConnector', () => {
	let setup: KafkaConnector;
	let connector: KafkaConnector | undefined;

	beforeAll(async () => {
		setup = new KafkaConnector({ name: 'setup', brokers: BROKERS });
		await setup.connect();
		await setup.admin().createTopics({
			topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }],
		});
	});
	afterAll(async () => {
		await setup
			.admin()
			.deleteTopics({ topics: [TOPIC] })
			.catch(() => {});
		await setup.close();
	});
	afterEach(async () => {
		await connector?.close();
		connector = undefined;
	});

	test('brokers: a comma-separated string or an array; admin() is its own connection', async () => {
		connector = new KafkaConnector({
			name: 'kafka',
			brokers: ` ${BROKERS} , `,
		});
		await connector.connect();
		expect(connector.state).toBe('ready');
		expect(await connector.admin().listTopics()).toContain(TOPIC);
		const other = new KafkaConnector({ name: 'arr', brokers: [BROKERS] });
		await other.connect();
		expect((await other.health()).ok).toBe(true);
		await other.close();
	});

	test('admin() before connect → NOT_READY', () => {
		connector = new KafkaConnector({ name: 'kafka', brokers: BROKERS });
		expect(() => connector!.admin()).toThrow(LinkError);
	});

	test('producer → consumer round trip; consumer ready only after joining its group', async () => {
		connector = new KafkaConnector({ name: 'kafka', brokers: BROKERS });
		await connector.connect();

		const producer = connector.producer({ name: 'out' });
		await producer.connect();
		expect(producer.state).toBe('ready');

		const joined: string[] = [];
		const consumer = connector.consumer({
			name: 'in',
			groupId: `lifecycle-${Date.now()}`,
			on: { connect: ({ name }) => joined.push(name) },
		});
		await consumer.connect();
		expect(consumer.state).toBe('connecting'); // connected, not yet in its group
		expect((await consumer.ping()).ok).toBe(false);

		const received: string[] = [];
		const raw = consumer.getInstance(); // available before ready — needed to join
		await raw.subscribe({ topic: TOPIC, fromBeginning: true });
		await raw.run({
			eachMessage: async ({ message }) => {
				received.push(message.value?.toString() ?? '');
			},
		});
		await until(() => consumer.state === 'ready');
		expect(joined).toEqual(['in']);

		await producer
			.getInstance()
			.send({ topic: TOPIC, messages: [{ value: 'hi' }] });
		await until(() => received.includes('hi'));
	}, 30_000);

	test('a crashed / disconnected consumer fails alone; the connector stays ready', async () => {
		connector = new KafkaConnector({ name: 'kafka', brokers: BROKERS });
		await connector.connect();
		const producer = connector.producer({ name: 'out' });
		await producer.connect();
		const consumer = connector.consumer({
			name: 'in',
			groupId: `crash-${Date.now()}`,
		});
		await consumer.connect();

		const failures: string[] = [];
		const watched = connector.consumer({
			name: 'watched',
			groupId: `watched-${Date.now()}`,
			on: { fail: ({ name }) => failures.push(name) },
		});
		await watched.connect();
		await watched.getInstance().disconnect(); // driver-side disconnect, not our close()
		await until(() => watched.state === 'failed');
		expect(failures).toEqual(['watched']);
		expect(connector.state).toBe('ready');
		expect(producer.state).toBe('ready');

		await watched.connect(); // the owner's usual way back: a fresh consumer connection
		expect(watched.state).toBe('connecting');
	}, 30_000);

	test('producers / consumers tracked by name across both kinds; duplicates throw', async () => {
		connector = new KafkaConnector({ name: 'kafka', brokers: BROKERS });
		const producer = connector.producer({ name: 'x' });
		expect(connector.producers.get('x')).toBe(producer);
		expect(() => connector!.consumer({ name: 'x', groupId: 'g' })).toThrow(
			LinkError,
		);
		await producer.close();
		expect(() =>
			connector!.consumer({ name: 'x', groupId: 'g' }),
		).not.toThrow();
		expect(connector.consumers.has('x')).toBe(true);
	});

	test('producer connect() before the connector → NOT_READY', async () => {
		connector = new KafkaConnector({ name: 'kafka', brokers: BROKERS });
		await expect(
			connector.producer({ name: 'p' }).connect(),
		).rejects.toBeInstanceOf(LinkError);
	});

	test("the connector's breaker releasing it fails producers and consumers; close() closes them", async () => {
		connector = new KafkaConnector({
			name: 'kafka',
			brokers: BROKERS,
			health: { threshold: 1, cooldown: 60_000, attempts: 1 },
		});
		await connector.connect();
		const producer = connector.producer({ name: 'out' });
		await producer.connect();
		connector.breaker.open({ ms: 60_000 });
		await until(() => producer.state === 'failed');
		expect(connector.state).toBe('failed');

		connector.breaker.reset();
		await connector.connect();
		await producer.connect();
		expect(producer.state).toBe('ready');
		await connector.close();
		expect(producer.state).toBe('closed');
		connector = undefined;
	}, 30_000);
});
