// lib/core/redis/redis.connector.ts

import type { Result } from '@rniverse/utils/result';
import { Connector, type Links } from '@shared/link';
import { appName } from '@shared/setting';
import {
	GlideClient,
	type GlideClientConfiguration,
} from '@valkey/valkey-glide';
import { configuration } from './redis.helper';
import { RedisSubscriber } from './redis.subscriber';
import type { RedisConfig } from './redis.type';

/**
 * One Redis / Valkey server + logical database, via glide — `getInstance()` is
 * the `GlideClient` itself. Extra connections: `subscribers` (config).
 */
export class RedisConnector extends Connector<GlideClient> {
	private readonly glide: GlideClientConfiguration;

	constructor(config: RedisConfig) {
		super(config);
		this.glide = configuration({
			config,
			appName: appName({ value: config.appName, connector: config.name }),
		});
		for (const { channels, patterns, ...link } of config.subscribers ?? []) {
			this.__adopt(
				new RedisSubscriber({
					...this.__child(link),
					server: this,
					channels: channels ?? [],
					patterns: patterns ?? [],
				}),
			);
		}
	}

	get subscribers(): Links<RedisSubscriber> {
		return this.__of({ kind: RedisSubscriber });
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
