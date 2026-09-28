// lib/core/redis/redis.connector.ts

import type { Result } from '@rniverse/utils/result';
import { Connector } from '@shared/link';
import { appName } from '@shared/setting';
import {
	GlideClient,
	type GlideClientConfiguration,
} from '@valkey/valkey-glide';
import { configuration } from './redis.helper';
import { RedisSubscriber } from './redis.subscriber';
import type { RedisConfig, RedisSubscriberOptions } from './redis.type';

/**
 * One Redis / Valkey server + logical database, via glide — `getInstance()` is
 * the `GlideClient` itself. Extra connections: `subscriber()`.
 */
export class RedisConnector extends Connector<GlideClient> {
	private readonly glide: GlideClientConfiguration;

	constructor(config: RedisConfig) {
		super(config);
		this.glide = configuration({
			config,
			appName: appName({ value: config.appName, connector: config.name }),
		});
	}

	/** A pub/sub subscriber on its own connection. */
	subscriber(options: RedisSubscriberOptions): RedisSubscriber {
		const { channels, patterns, onMessage, ...link } = options;
		return new RedisSubscriber({
			...this.__child(link),
			parent: this,
			channels: channels ?? [],
			patterns: patterns ?? [],
			onMessage,
		});
	}

	get subscribers(): ReadonlyMap<string, RedisSubscriber> {
		return this.scope.of({ kind: RedisSubscriber });
	}

	/** The glide configuration subscribers build their own client from. Internal. */
	configuration(): GlideClientConfiguration {
		return this.glide;
	}

	protected async __open(): Promise<GlideClient> {
		const client = await GlideClient.createClient(this.glide);
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
}
