// lib/core/postgres/postgres.listener.ts

import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import type { ListenMeta } from 'postgres';
import type { PostgresConnector } from './postgres.connector';
import { payload } from './postgres.helper';
import type { PostgresListenerEvents } from './postgres.type';

/**
 * LISTEN on one channel, over a dedicated connection postgres.js opens next to
 * the pool. Each NOTIFY is a `message` event. postgres.js re-LISTENs by itself
 * after a dropped connection and calls back each time — that's what marks this
 * `ready` again.
 *
 * postgres.js exposes no state for that connection, so `ping()` checks the
 * connector's pool — not the LISTEN socket itself.
 */
export class PostgresListener extends Link<ListenMeta, PostgresListenerEvents> {
	private readonly database: PostgresConnector;
	readonly channel: string;

	constructor(
		init: LinkInit & { database: PostgresConnector; channel: string },
	) {
		super(init);
		this.database = init.database;
		this.channel = init.channel;
	}

	protected async __open(): Promise<ListenMeta> {
		const sql = this.database.getInstance().$client;
		const epoch = this.__epoch();
		return sql.listen(
			this.channel,
			(raw) => this.__emit('message', payload({ raw })),
			() => this.__mark({ state: 'ready', epoch }),
		);
	}

	protected async __shut(options: { instance: ListenMeta }): Promise<void> {
		await options.instance.unlisten();
	}

	protected async __ping(): Promise<Result<unknown>> {
		return this.database.ping();
	}
}
