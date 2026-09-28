// lib/core/postgres/postgres.listener.ts

import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '@shared/link';
import type { ListenMeta } from 'postgres';
import type { PostgresConnector } from './postgres.connector';
import { payload } from './postgres.helper';

/**
 * LISTEN on one channel, over a dedicated connection postgres.js opens next to
 * the pool. postgres.js re-LISTENs by itself after a dropped connection and
 * calls back each time — that's what marks this `ready` again.
 *
 * postgres.js exposes no state for that connection, so `ping()` checks the
 * connector's pool and that this LISTEN is registered — not the LISTEN socket
 * itself.
 */
export class PostgresListener extends Link<ListenMeta> {
	private readonly parent: PostgresConnector;
	readonly channel: string;
	private readonly onMessage: (payload: unknown) => void;

	constructor(
		init: LinkInit & {
			parent: PostgresConnector;
			channel: string;
			onMessage: (payload: unknown) => void;
		},
	) {
		super(init);
		this.parent = init.parent;
		this.channel = init.channel;
		this.onMessage = init.onMessage;
	}

	protected async __open(): Promise<ListenMeta> {
		const sql = this.parent.getInstance().$client;
		const epoch = this.__epoch();
		return sql.listen(
			this.channel,
			(raw) => {
				try {
					this.onMessage(payload({ raw }));
				} catch (error) {
					log.error(error, `${this.label}: onMessage failed`);
				}
			},
			() => this.__mark({ state: 'ready', epoch }),
		);
	}

	protected async __shut(options: { instance: ListenMeta }): Promise<void> {
		await options.instance.unlisten();
	}

	protected async __ping(): Promise<Result<unknown>> {
		return this.parent.ping();
	}
}
