// lib/core/redis/redis.subscriber.ts

import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import {
	GlideClient,
	GlideClientConfiguration,
	type PubSubMsg,
} from '@valkey/valkey-glide';
import type { RedisConnector } from './redis.connector';
import type { RedisMessage } from './redis.type';

const text = (value: PubSubMsg['message']): string =>
	typeof value === 'string' ? value : Buffer.from(value).toString();

/**
 * A pub/sub subscriber on its own `GlideClient`. Glide fixes subscriptions at
 * creation, so channels / patterns are given up front.
 */
export class RedisSubscriber extends Link<GlideClient> {
	private readonly parent: RedisConnector;
	readonly channels: readonly string[];
	readonly patterns: readonly string[];
	private readonly onMessage: (message: RedisMessage) => void;

	constructor(
		init: LinkInit & {
			parent: RedisConnector;
			channels: string[];
			patterns: string[];
			onMessage: (message: RedisMessage) => void;
		},
	) {
		super(init);
		this.parent = init.parent;
		this.channels = init.channels;
		this.patterns = init.patterns;
		this.onMessage = init.onMessage;
	}

	protected async __open(): Promise<GlideClient> {
		// Needs its connector connected, like every extra connection.
		this.parent.getInstance();
		const modes = GlideClientConfiguration.PubSubChannelModes;
		const client = await GlideClient.createClient({
			...this.parent.configuration(),
			pubsubSubscriptions: {
				channelsAndPatterns: {
					[modes.Exact]: new Set(this.channels),
					[modes.Pattern]: new Set(this.patterns),
				},
				callback: (msg) => this.__deliver({ msg }),
			},
		});
		try {
			await client.ping();
		} catch (error) {
			client.close();
			throw error;
		}
		return client;
	}

	protected async __shut(options: { instance: GlideClient }): Promise<void> {
		options.instance.close();
	}

	protected async __ping(options: {
		instance: GlideClient;
	}): Promise<Result<unknown>> {
		return { ok: true, data: await options.instance.ping() };
	}

	private __deliver(options: { msg: PubSubMsg }): void {
		const { msg } = options;
		try {
			this.onMessage({
				channel: text(msg.channel),
				...(msg.pattern && { pattern: text(msg.pattern) }),
				message: text(msg.message),
			});
		} catch (error) {
			log.error(error, `${this.label}: onMessage failed`);
		}
	}
}
