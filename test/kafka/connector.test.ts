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

	/** A connector with one producer and one consumer that records messages. */
	const declared = (options: { consumer?: object; health?: object } = {}) => {
		connector = new KafkaConnector({
			name: 'kafka',
			brokers: BROKERS,
			producers: [{ name: 'out' }],
			consumers: [
				{ name: 'in', groupId: `group-${Date.now()}`, ...options.consumer },
			],
			...(options.health && { health: options.health }),
		});
		return {
			producer: connector.producers.get('out'),
			consumer: connector.consumers.get('in'),
		};
	};

	test('producer → consumer round trip: both connect with the connector; the owner subscribes on connect', async () => {
		const { producer, consumer } = declared();
		const connects: string[] = [];
		const received: string[] = [];
		consumer.on('connect', {
			name: 'subscribe',
			handler: async ({ name }) => {
				connects.push(name);
				const raw = consumer.getInstance();
				await raw.subscribe({ topic: TOPIC, fromBeginning: true });
				await raw.run({
					eachMessage: async ({ message }) => {
						received.push(message.value?.toString() ?? '');
					},
				});
			},
		});
		await connector!.connect();
		await until(() => producer.state === 'ready' && consumer.state === 'ready');
		expect(connects).toEqual(['in']);

		await producer
			.getInstance()
			.send({ topic: TOPIC, messages: [{ value: 'hi' }] });
		await until(() => received.includes('hi'));
	}, 30_000);

	test('kafkajs restarts a crashed consumer — connecting, then recover; no second connect, no re-subscribe', async () => {
		const { producer, consumer } = declared({
			consumer: { retry: { retries: 0, initialRetryTime: 100 } },
		});
		const events: string[] = [];
		for (const type of ['connect', 'recover', 'fail'] as const) {
			consumer.on(type, {
				name: 'recorder',
				handler: () => {
					events.push(type);
				},
			});
		}
		let thrown = false;
		const received: string[] = [];
		consumer.on('connect', {
			name: 'subscribe',
			handler: async () => {
				const raw = consumer.getInstance();
				await raw.subscribe({ topic: TOPIC, fromBeginning: true });
				await raw.run({
					eachMessage: async ({ message }) => {
						const value = message.value?.toString() ?? '';
						if (value === 'boom' && !thrown) {
							thrown = true;
							throw new Error('handler crash'); // retries exhausted → CRASH, restart
						}
						received.push(value);
					},
				});
			},
		});
		await connector!.connect();
		await until(() => producer.state === 'ready' && consumer.state === 'ready');
		const raw = consumer.getInstance();
		await sleep(1_000); // let it join before publishing
		await producer
			.getInstance()
			.send({ topic: TOPIC, messages: [{ value: 'boom' }] });
		await until(() => received.includes('boom')); // redelivered after the restart
		await until(() => consumer.state === 'ready');
		expect(consumer.getInstance()).toBe(raw);
		expect(events.filter((e) => e === 'connect')).toEqual(['connect']);
		expect(events).toContain('recover');
		expect(events).not.toContain('fail'); // a restart isn't a failure
	}, 60_000);

	test('a consumer kafkajs gives up on fails alone and stays failed; the connector and producer stay ready', async () => {
		const { producer, consumer } = declared({
			consumer: {
				retry: { retries: 0, restartOnFailure: async () => false },
			},
		});
		const failures: string[] = [];
		consumer.on('fail', {
			name: 'test',
			handler: ({ name }) => {
				failures.push(name);
			},
		});
		consumer.on('connect', {
			name: 'subscribe',
			handler: async () => {
				const raw = consumer.getInstance();
				await raw.subscribe({ topic: TOPIC, fromBeginning: true });
				await raw.run({
					eachMessage: async () => {
						throw new Error('handler crash');
					},
				});
			},
		});
		await connector!.connect();
		await until(() => producer.state === 'ready');
		await producer
			.getInstance()
			.send({ topic: TOPIC, messages: [{ value: 'fatal' }] });
		await until(() => consumer.state === 'failed');
		expect(failures).toEqual(['in']);
		expect(connector!.state).toBe('ready');
		expect(producer.state).toBe('ready');

		await connector!.health(); // it has a driver object — left to the driver
		expect(consumer.state).toBe('failed');

		await consumer.close(); // the owner decides: a fresh consumer
		consumer.off('connect', { name: 'subscribe' });
		await consumer.connect();
		expect(consumer.state).toBe('ready');
	}, 30_000);

	test('looked up by name; names are unique across producers and consumers', () => {
		const { producer } = declared();
		expect(connector!.producers.get('out')).toBe(producer);
		expect(() => connector!.producers.get('in')).toThrow(LinkError);
		expect(
			() =>
				new KafkaConnector({
					name: 'dup',
					brokers: BROKERS,
					producers: [{ name: 'x' }],
					consumers: [{ name: 'x', groupId: 'g' }],
				}),
		).toThrow(LinkError);
	});

	test('producer connect() before the connector is ready waits — no throw, stays idle', async () => {
		const { producer } = declared();
		await producer.connect();
		expect(producer.state).toBe('idle');
	});

	test('the connector failing takes its producer down and back — same object; close() closes it', async () => {
		const { producer } = declared({
			health: { threshold: 1, cooldown: 60_000, attempts: 1 },
		});
		await connector!.connect();
		await until(() => producer.state === 'ready');
		const raw = producer.getInstance();
		connector!.breaker.open({ ms: 60_000 });
		expect(connector!.state).toBe('failed');
		expect(producer.state).toBe('failed');

		connector!.breaker.reset();
		expect((await connector!.health()).ok).toBe(true);
		expect(producer.state).toBe('ready');
		expect(producer.getInstance()).toBe(raw);
		await connector!.close();
		expect(producer.state).toBe('closed');
		connector = undefined;
	}, 30_000);
});
