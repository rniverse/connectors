// lib/core/redpanda.connector.ts

import { log } from '@rniverse/utils';
import { initRedpanda } from '@tools/redpanda.tool';
import type {
	RedpandaConnectorConfig,
	RedpandaConnectorURLConfig,
	RedpandaMessage,
	RedpandaSubscribeConfig,
	RedpandaTopicConfig,
} from '@type/redpanda.type';
import type { Admin, Consumer, EachMessagePayload, Producer } from 'kafkajs';
import { Partitioners } from 'kafkajs';

export class RedpandaConnector {
	private kafka: ReturnType<typeof initRedpanda>;
	private adminClient: Admin | null = null;
	private admin_promise: Promise<Admin> | null = null;
	private producer: Producer | null = null;
	private producer_promise: Promise<Producer> | null = null;
	private consumer: Consumer | null = null;
	private consumer_promise: Promise<Consumer> | null = null;
	private consumer_running = false;
	private consumer_group_id: string | null = null;
	private config: RedpandaConnectorConfig | RedpandaConnectorURLConfig;

	constructor(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig) {
		this.config = config;
		this.kafka = initRedpanda(this.config);
	}

	/**
	 * Verify connectivity by performing an admin listTopics call.
	 */
	async connect(): Promise<void> {
		const admin = await this.getAdmin();
		await admin.listTopics();
		log.info('Redpanda connected');
	}

	private async getAdmin(): Promise<Admin> {
		if (!this.admin_promise) {
			this.admin_promise = this.__connect_admin();
		}
		return this.admin_promise;
	}

	private async __connect_admin(): Promise<Admin> {
		try {
			const admin = this.kafka.admin();
			await admin.connect();
			this.adminClient = admin;
			return admin;
		} catch (err) {
			this.admin_promise = null;
			throw err;
		}
	}

	private async getProducer(): Promise<Producer> {
		if (!this.producer_promise) {
			this.producer_promise = this.__connect_producer();
		}
		return this.producer_promise;
	}

	private async __connect_producer(): Promise<Producer> {
		try {
			const producer = this.kafka.producer({
				createPartitioner: Partitioners.DefaultPartitioner,
				...('producer' in this.config ? this.config.producer : {}),
			});
			await producer.connect();
			this.producer = producer;
			log.info('Redpanda producer connected');
			return producer;
		} catch (err) {
			this.producer_promise = null;
			throw err;
		}
	}

	private async getConsumer(groupId: string): Promise<Consumer> {
		if (this.consumer_group_id && this.consumer_group_id !== groupId) {
			throw new Error(
				`Consumer already exists with groupId "${this.consumer_group_id}" — cannot create with "${groupId}". Call unsubscribe() first.`,
			);
		}
		if (!this.consumer_promise) {
			this.consumer_group_id = groupId;
			this.consumer_promise = this.__connect_consumer(groupId);
		}
		return this.consumer_promise;
	}

	private async __connect_consumer(groupId: string): Promise<Consumer> {
		try {
			const consumer = this.kafka.consumer({
				groupId,
				...('consumer' in this.config ? this.config.consumer : {}),
			});
			await consumer.connect();
			this.consumer = consumer;
			log.info({ groupId }, 'Redpanda consumer connected');
			return consumer;
		} catch (err) {
			this.consumer_promise = null;
			this.consumer_group_id = null;
			throw err;
		}
	}

	async ping() {
		try {
			const admin = await this.getAdmin();
			await admin.listTopics();
			return { ok: true as const };
		} catch (err) {
			log.error({ error: err }, 'Redpanda ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health() {
		return this.ping();
	}

	async createTopic(config: RedpandaTopicConfig) {
		try {
			const admin = await this.getAdmin();
			await admin.createTopics({
				topics: [
					{
						topic: config.topic,
						numPartitions: config.numPartitions || 1,
						replicationFactor: config.replicationFactor || 1,
						configEntries: config.configEntries,
					},
				],
			});
			log.info({ topic: config.topic }, 'Topic created');
			return { ok: true as const };
		} catch (err) {
			log.error({ error: err, topic: config.topic }, 'Failed to create topic');
			return { ok: false as const, error: err };
		}
	}

	async listTopics() {
		try {
			const admin = await this.getAdmin();
			const data = await admin.listTopics();
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err }, 'Failed to list topics');
			return { ok: false as const, error: err };
		}
	}

	async deleteTopic(topic: string) {
		try {
			const admin = await this.getAdmin();
			await admin.deleteTopics({ topics: [topic] });
			log.info({ topic }, 'Topic deleted');
			return { ok: true as const };
		} catch (err) {
			log.error({ error: err, topic }, 'Failed to delete topic');
			return { ok: false as const, error: err };
		}
	}

	async fetchTopicMetadata(topics?: string[]) {
		try {
			const admin = await this.getAdmin();
			const data = await admin.fetchTopicMetadata(
				topics ? { topics } : undefined,
			);
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err }, 'Failed to fetch topic metadata');
			return { ok: false as const, error: err };
		}
	}

	async publish(message: RedpandaMessage) {
		try {
			const producer = await this.getProducer();
			const data = await producer.send({
				topic: message.topic,
				messages: message.messages.map((msg) => ({
					key: msg.key,
					value: msg.value,
					headers: msg.headers,
					partition: msg.partition,
				})),
			});
			return { ok: true as const, data };
		} catch (err) {
			log.error({ error: err, topic: message.topic }, 'Failed to publish message');
			return { ok: false as const, error: err };
		}
	}

	async subscribe(
		config: RedpandaSubscribeConfig,
		handler: (payload: EachMessagePayload) => Promise<void>,
	) {
		try {
			if (this.consumer_running) {
				throw new Error(
					'Consumer is already running — call unsubscribe() before re-subscribing',
				);
			}

			const consumer = await this.getConsumer(config.groupId);

			for (const topic of config.topics) {
				await consumer.subscribe({
					topic,
					fromBeginning: config.fromBeginning || false,
				});
			}

			await consumer.run({
				autoCommit: config.autoCommit !== false,
				eachMessage: handler,
			});

			this.consumer_running = true;
			log.info({ topics: config.topics, groupId: config.groupId }, 'Consumer subscribed');
			return { ok: true as const, data: consumer };
		} catch (err) {
			log.error({ error: err }, 'Failed to subscribe');
			return { ok: false as const, error: err };
		}
	}

	async unsubscribe(): Promise<void> {
		if (this.consumer) {
			await this.consumer.disconnect();
			this.consumer = null;
			this.consumer_promise = null;
			this.consumer_running = false;
			this.consumer_group_id = null;
			log.info('Consumer disconnected');
		}
	}

	async close(): Promise<void> {
		const tasks: Promise<void>[] = [];

		if (this.producer) {
			tasks.push(this.producer.disconnect().then(() => {
				this.producer = null;
				this.producer_promise = null;
			}));
		}
		if (this.consumer) {
			tasks.push(this.consumer.disconnect().then(() => {
				this.consumer = null;
				this.consumer_promise = null;
				this.consumer_running = false;
				this.consumer_group_id = null;
			}));
		}
		if (this.adminClient) {
			tasks.push(this.adminClient.disconnect().then(() => {
				this.adminClient = null;
				this.admin_promise = null;
			}));
		}

		await Promise.all(tasks);
		log.info('Redpanda connections closed');
	}

	getInstance() {
		return this.kafka;
	}

	getAdminInstance() {
		return this.adminClient;
	}

	getProducerInstance() {
		return this.producer;
	}

	getConsumerInstance() {
		return this.consumer;
	}
}
