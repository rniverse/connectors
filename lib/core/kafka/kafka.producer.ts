// lib/core/kafka/kafka.producer.ts

import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import { Partitioners, type Producer, type ProducerConfig } from 'kafkajs';
import type { KafkaConnector } from './kafka.connector';

/**
 * A kafkajs producer on its own connections. `ready` on kafkajs `CONNECT`,
 * `failed` on `DISCONNECT`; `ping()` reports that state (kafkajs has no
 * producer-level ping, and reconnects to brokers lazily on the next send).
 */
export class KafkaProducer extends Link<Producer> {
	private readonly parent: KafkaConnector;
	private readonly settings: Partial<ProducerConfig>;

	constructor(
		init: LinkInit & {
			parent: KafkaConnector;
			settings: Partial<ProducerConfig>;
		},
	) {
		super(init);
		this.parent = init.parent;
		this.settings = init.settings;
	}

	protected async __open(): Promise<Producer> {
		const epoch = this.__epoch();
		const producer = this.parent.getInstance().producer({
			createPartitioner: Partitioners.DefaultPartitioner,
			...this.settings,
		});
		producer.on(producer.events.CONNECT, () =>
			this.__mark({ state: 'ready', epoch }),
		);
		producer.on(producer.events.DISCONNECT, () =>
			this.__mark({
				state: 'failed',
				epoch,
				error: new Error(`${this.label}: disconnected`),
			}),
		);
		await producer.connect();
		return producer;
	}

	protected async __shut(options: { instance: Producer }): Promise<void> {
		await options.instance.disconnect();
	}

	protected async __ping(): Promise<Result<unknown>> {
		return this.state === 'ready'
			? { ok: true }
			: { ok: false, error: new Error(`${this.label}: ${this.state}`) };
	}
}
