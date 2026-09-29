// lib/core/kafka/kafka.consumer.ts

import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import type { Consumer, ConsumerConfig } from 'kafkajs';
import type { KafkaConnector } from './kafka.connector';

/**
 * A kafkajs consumer. `ready` once `consumer.connect()` resolves — `connect`
 * fires then, and the owner does `subscribe()` + `run()` in its listener,
 * once per consumer object.
 *
 * kafkajs owns recovery: after a crash it restarts the same consumer (with its
 * subscription and `run()`), so this goes `connecting` and back to `ready`
 * (`recover`) on the next group join. A crash kafkajs won't restart is
 * `failed` — and stays so; the owner decides (`close()` + `connect()` for a
 * fresh consumer).
 *
 * kafkajs disconnects before it reports a crash, so a `DISCONNECT` alone only
 * means "not connected" (`connecting`) — the `CRASH` that follows decides.
 * Stop a consumer with `close()`, not the raw `disconnect()`.
 */
export class KafkaConsumer extends Link<Consumer> {
	private readonly cluster: KafkaConnector;
	private readonly settings: ConsumerConfig;

	constructor(
		init: LinkInit & { cluster: KafkaConnector; settings: ConsumerConfig },
	) {
		super(init);
		this.cluster = init.cluster;
		this.settings = init.settings;
	}

	protected async __open(): Promise<Consumer> {
		const epoch = this.__epoch();
		const consumer = this.cluster.getInstance().consumer(this.settings);
		const { GROUP_JOIN, REBALANCING, CRASH, DISCONNECT } = consumer.events;
		consumer.on(CRASH, (event) => {
			const { error, restart } = event.payload;
			if (restart)
				log.warn({ err: error }, `${this.label}: kafkajs restarting`);
			this.__mark({ state: restart ? 'connecting' : 'failed', epoch, error });
		});
		// A restart's join brings it back — even while its connector is down
		// (the driver's report wins); the first join finds it ready already.
		consumer.on(GROUP_JOIN, () => this.__mark({ state: 'ready', epoch }));
		consumer.on(REBALANCING, () => log.info(`${this.label}: rebalancing`));
		consumer.on(DISCONNECT, () => this.__mark({ state: 'connecting', epoch }));
		await consumer.connect();
		return consumer;
	}

	protected async __shut(options: { instance: Consumer }): Promise<void> {
		await options.instance.disconnect();
	}

	protected async __ping(): Promise<Result<unknown>> {
		return this.state === 'ready'
			? { ok: true }
			: { ok: false, error: new Error(`${this.label}: ${this.state}`) };
	}
}
