// lib/core/kafka/kafka.connector.ts

import type { Result } from '@rniverse/utils/result';
import { Connector, type Links } from '@shared/link';
import { appName } from '@shared/setting';
import type { Admin, Kafka } from 'kafkajs';
import { KafkaConsumer } from './kafka.consumer';
import { client } from './kafka.helper';
import { KafkaProducer } from './kafka.producer';
import type { KafkaConfig } from './kafka.type';

/**
 * One Kafka / Redpanda cluster — `getInstance()` is the kafkajs `Kafka`; the
 * connector's own connection is its admin client. Extra connections:
 * `producers`, `consumers` (config).
 */
export class KafkaConnector extends Connector<Kafka> {
	private readonly config: KafkaConfig;
	private readonly appName: string;
	// The admin client of each opened Kafka — looked up via the current
	// instance, so a stale connection's admin is never handed out.
	private readonly admins = new WeakMap<Kafka, Admin>();

	constructor(config: KafkaConfig) {
		super(config);
		this.config = config;
		this.appName = appName({ value: config.appName, connector: config.name });
		for (const { name, health, ...settings } of config.producers ?? []) {
			this.__adopt(
				new KafkaProducer({
					...this.__child({ name, health }),
					cluster: this,
					settings,
				}),
			);
		}
		for (const { name, health, ...settings } of config.consumers ?? []) {
			this.__adopt(
				new KafkaConsumer({
					...this.__child({ name, health }),
					cluster: this,
					settings,
				}),
			);
		}
	}

	/** The connector's own admin connection. */
	admin(): Admin {
		const admin = this.admins.get(this.getInstance());
		if (!admin) throw this.__notReady();
		return admin;
	}

	get producers(): Links<KafkaProducer> {
		return this.__of({ kind: KafkaProducer });
	}

	get consumers(): Links<KafkaConsumer> {
		return this.__of({ kind: KafkaConsumer });
	}

	protected async __open(): Promise<Kafka> {
		const kafka = client({ config: this.config, appName: this.appName });
		const admin = kafka.admin();
		try {
			await admin.connect();
			await admin.listTopics();
		} catch (error) {
			await admin.disconnect().catch(() => {});
			throw error;
		}
		this.admins.set(kafka, admin);
		return kafka;
	}

	protected async __shut(options: { instance: Kafka }): Promise<void> {
		await this.admins.get(options.instance)?.disconnect();
		this.admins.delete(options.instance);
	}

	protected async __ping(options: {
		instance: Kafka;
	}): Promise<Result<unknown>> {
		const admin = this.admins.get(options.instance);
		if (!admin) return { ok: false, error: this.__notReady() };
		return { ok: true, data: await admin.listTopics() };
	}
}
