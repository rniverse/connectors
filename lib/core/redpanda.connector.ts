// lib/core/redpanda.connector.ts

import { log } from '@rniverse/utils';
import { initRedpanda } from '@tools/redpanda.tool';
import type {
	RedpandaConnectorConfig,
	RedpandaConnectorURLConfig,
} from '@type/redpanda.type';
import type { Admin, ConsumerConfig, ProducerConfig } from 'kafkajs';
import { Partitioners } from 'kafkajs';

export class RedpandaConnector {
	private kafka: ReturnType<typeof initRedpanda>;
	private adminClient: Admin | null = null;
	private admin_promise: Promise<Admin> | null = null;
	private config: RedpandaConnectorConfig | RedpandaConnectorURLConfig;

	constructor(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig) {
		this.config = config;
		this.kafka = initRedpanda(this.config);
	}

	/**
	 * Verify connectivity by performing an admin listTopics call.
	 * Returns the admin instance for immediate use.
	 */
	async connect(): Promise<Admin> {
		const admin = await this.getAdmin();
		await admin.listTopics();
		log.info('Redpanda connected');
		return admin;
	}

	/**
	 * Get or create a connected Admin client (lazy, cached).
	 */
	async getAdmin(): Promise<Admin> {
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

	/**
	 * Create and connect a new Producer.
	 * Caller is responsible for calling producer.disconnect() when done.
	 */
	async getProducer(config?: Partial<ProducerConfig>): Promise<ReturnType<typeof this.kafka.producer>> {
		const producer = this.kafka.producer({
			createPartitioner: Partitioners.DefaultPartitioner,
			...config,
		});
		await producer.connect();
		log.info('Redpanda producer connected');
		return producer;
	}

	/**
	 * Create and connect a new Consumer.
	 * Caller is responsible for calling consumer.disconnect() when done.
	 */
	async getConsumer(config: ConsumerConfig): Promise<ReturnType<typeof this.kafka.consumer>> {
		const consumer = this.kafka.consumer(config);
		await consumer.connect();
		log.info({ groupId: config.groupId }, 'Redpanda consumer connected');
		return consumer;
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

	getInstance() {
		return this.kafka;
	}

	async close(): Promise<void> {
		if (this.adminClient) {
			await this.adminClient.disconnect();
			this.adminClient = null;
			this.admin_promise = null;
		}
		log.info('Redpanda connections closed');
	}
}
