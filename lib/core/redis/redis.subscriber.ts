// lib/core/redis/redis.subscriber.ts

import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import {
	GlideClient,
	GlideClientConfiguration,
	type PubSubMsg,
} from '@valkey/valkey-glide';
import type { RedisConnector } from './redis.connector';
import type { RedisSubscriberEvents } from './redis.type';

const text = (value: PubSubMsg['message']): string =>
	typeof value === 'string' ? value : Buffer.from(value).toString();

/**
 * A pub/sub subscriber on its own `GlideClient`; each message is a `message`
 * event. Glide fixes subscriptions at creation, so channels / patterns are
 * given up front, in the connector's config.
 */
export class RedisSubscriber extends Link<GlideClient, RedisSubscriberEvents> {
	private readonly server: RedisConnector;
	readonly channels: readonly string[];
	readonly patterns: readonly string[];

	constructor(
		init: LinkInit & {
			server: RedisConnector;
			channels: string[];
			patterns: string[];
		},
	) {
		super(init);
		this.server = init.server;
		this.channels = init.channels;
		this.patterns = init.patterns;
	}

	protected async __open(): Promise<GlideClient> {
		// Needs its connector connected, like every extra connection.
		this.server.getInstance();
		const modes = GlideClientConfiguration.PubSubChannelModes;
		const client = await GlideClient.createClient({
			...this.server.configuration(),
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
		this.__emit('message', {
			channel: text(msg.channel),
			...(msg.pattern && { pattern: text(msg.pattern) }),
			message: text(msg.message),
		});
	}
}
