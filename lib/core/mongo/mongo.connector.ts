// lib/core/mongo/mongo.connector.ts

import type { Result } from '@rniverse/utils/result';
import { Connector } from '@shared/link';
import { appName } from '@shared/setting';
import { type Db, MongoClient, type MongoClientOptions } from 'mongodb';
import { options } from './mongo.helper';
import type { MongoConfig } from './mongo.type';

/**
 * One Mongo cluster — `getInstance()` is the `MongoClient`. Many databases on
 * the same pool via `db(name)`; no extra connections to track.
 *
 * State also follows the driver's server heartbeats: a failed heartbeat marks
 * it `failed`, the next successful one `ready` again (`recover`).
 */
export class MongoConnector extends Connector<MongoClient> {
	private readonly url: string;
	private readonly database: string | undefined;
	private readonly settings: MongoClientOptions;

	constructor(config: MongoConfig) {
		super(config);
		this.url = config.url;
		this.database = config.database;
		this.settings = options({
			config,
			appName: appName({ value: config.appName, connector: config.name }),
		});
	}

	/** A database on the same pool. Default: `config.database`, else the URL's. */
	db(name?: string): Db {
		return this.getInstance().db(name ?? this.database);
	}

	protected async __open(): Promise<MongoClient> {
		const epoch = this.__epoch();
		const client = new MongoClient(this.url, this.settings);
		client.on('serverHeartbeatFailed', (event) =>
			this.__mark({ state: 'failed', epoch, error: event.failure }),
		);
		client.on('serverHeartbeatSucceeded', () =>
			this.__mark({ state: 'ready', epoch }),
		);
		try {
			await client.connect();
			await client.db(this.database).admin().ping();
		} catch (error) {
			await client.close().catch(() => {});
			throw error;
		}
		return client;
	}

	protected async __shut(options: { instance: MongoClient }): Promise<void> {
		await options.instance.close();
	}

	protected async __ping(options: {
		instance: MongoClient;
	}): Promise<Result<unknown>> {
		return {
			ok: true,
			data: await options.instance.db(this.database).admin().ping(),
		};
	}
}
