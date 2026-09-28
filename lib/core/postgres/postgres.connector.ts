// lib/core/postgres/postgres.connector.ts

import type { Result } from '@rniverse/utils/result';
import { Connector } from '@shared/link';
import { appName, setting } from '@shared/setting';
import { drizzle } from 'drizzle-orm/postgres-js';
import { client } from './postgres.helper';
import { PostgresListener } from './postgres.listener';
import type {
	PostgresConfig,
	PostgresDatabase,
	PostgresListenOptions,
	PostgresSchema,
} from './postgres.type';

/**
 * One Postgres database: a postgres.js pool behind a drizzle db. Another
 * database = another connector. Extra connections: `listen()`.
 */
export class PostgresConnector<
	TSchema extends PostgresSchema = PostgresSchema,
> extends Connector<PostgresDatabase<TSchema>> {
	private readonly config: PostgresConfig<TSchema>;
	private readonly appName: string;
	private readonly closeTimeout: number;

	constructor(config: PostgresConfig<TSchema>) {
		super(config);
		this.config = config;
		this.appName = appName({ value: config.appName, connector: config.name });
		this.closeTimeout = setting({
			value: config.closeTimeout,
			env: 'SQL_CLOSE_TIMEOUT_S',
			min: 0,
			fallback: 5,
		});
	}

	/** LISTEN on `channel` over its own connection. */
	listen(options: PostgresListenOptions): PostgresListener {
		const { channel, onMessage, ...link } = options;
		return new PostgresListener({
			...this.__child(link),
			parent: this,
			channel,
			onMessage,
		});
	}

	get listeners(): ReadonlyMap<string, PostgresListener> {
		return this.scope.of({ kind: PostgresListener });
	}

	protected async __open(): Promise<PostgresDatabase<TSchema>> {
		const sql = client({ config: this.config, appName: this.appName });
		try {
			await sql`SELECT 1`;
		} catch (error) {
			await sql.end({ timeout: 0 }).catch(() => {});
			throw error;
		}
		const { schema } = this.config;
		return (
			schema ? drizzle(sql, { schema }) : drizzle(sql)
		) as PostgresDatabase<TSchema>;
	}

	protected async __shut(options: {
		instance: PostgresDatabase<TSchema>;
	}): Promise<void> {
		await options.instance.$client.end({ timeout: this.closeTimeout });
	}

	protected async __ping(options: {
		instance: PostgresDatabase<TSchema>;
	}): Promise<Result<unknown>> {
		await options.instance.$client`SELECT 1`;
		return { ok: true };
	}
}
