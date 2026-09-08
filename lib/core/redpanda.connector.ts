// lib/core/redpanda.connector.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker, type CircuitState } from '@tools/circuit-breaker.tool';
import { initRedpanda } from '@tools/redpanda.tool';
import type {
	RedpandaConnectorConfig,
	RedpandaConnectorURLConfig,
} from '@type/redpanda.type';
import type {
	Admin,
	Consumer,
	ConsumerConfig,
	Producer,
	ProducerConfig,
} from 'kafkajs';
import { Partitioners } from 'kafkajs';

export class RedpandaConnector {
	private kafka: ReturnType<typeof initRedpanda>;
	private adminClient: Admin | null = null;
	private admin_promise: Promise<Admin> | null = null;
	private config: RedpandaConnectorConfig | RedpandaConnectorURLConfig;
	private consumers = new Set<ReturnType<typeof this.kafka.consumer>>();
	private producers = new Set<ReturnType<typeof this.kafka.producer>>();
	private breaker = new CircuitBreaker();

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
		this.breaker.reset();
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
	 * Call `connector.disconnect(producer)` when done so it is also untracked.
	 */
	async getProducer(
		config?: Partial<ProducerConfig>,
	): Promise<ReturnType<typeof this.kafka.producer>> {
		const producer = this.kafka.producer({
			createPartitioner: Partitioners.DefaultPartitioner,
			...config,
		});
		await producer.connect();
		log.info('Redpanda producer connected');
		this.producers.add(producer);
		return producer;
	}

	/**
	 * Create and connect a new Consumer.
	 * Call `connector.disconnect(consumer)` when done so it is also untracked.
	 */
	async getConsumer(
		config: ConsumerConfig,
	): Promise<ReturnType<typeof this.kafka.consumer>> {
		const consumer = this.kafka.consumer(config);
		await consumer.connect();
		this.consumers.add(consumer);
		log.info({ groupId: config.groupId }, 'Redpanda consumer connected');
		return consumer;
	}

	/**
	 * Disconnect a producer or consumer created by this connector and stop
	 * tracking it, so `close()` won't try to disconnect it again.
	 */
	async disconnect(client: Producer | Consumer): Promise<void> {
		await client.disconnect().catch((err) => {
			log.error(err, 'Error disconnecting Redpanda client');
		});
		this.producers.delete(client as Producer);
		this.consumers.delete(client as Consumer);
	}

	async ping(): Promise<Result<void>> {
		try {
			const admin = await this.getAdmin();
			await admin.listTopics();
			return { ok: true as const };
		} catch (err) {
			log.error(err, 'Redpanda ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health(): Promise<Result<void>> {
		const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
			min: 1,
			fallback: 3,
		});
		const result = await retry(() => this.ping(), {
			attempts,
			retryIf: (o) => o.ok && o.value.ok === false,
			onRetry: (_o, attempt) =>
				log.warn(
					`Redpanda health check failed, retrying... (${attempt}/${attempts})`,
				),
		});
		if (this.breaker.record(result.ok)) await this.close();
		return result;
	}

	/** `closed` (healthy) · `open` (down, connections released) · `half-open` (cooldown elapsed, reconnect). */
	get circuit(): CircuitState {
		return this.breaker.state;
	}

	getInstance() {
		return this.kafka;
	}

	async close(): Promise<void> {
		if (this.adminClient) {
			await this.adminClient.disconnect().catch((err) => {
				log.error(err, 'Error disconnecting Redpanda admin client');
			});
		}
		this.adminClient = null;
		this.admin_promise = null;
		for (const consumer of this.consumers) {
			await consumer.disconnect().catch((err) => {
				log.error(err, 'Error disconnecting Redpanda consumer');
			});
		}
		this.consumers.clear();
		for (const producer of this.producers) {
			await producer.disconnect().catch((err) => {
				log.error(err, 'Error disconnecting Redpanda producer');
			});
		}
		this.producers.clear();
		log.info('Redpanda connections closed');
	}
}
