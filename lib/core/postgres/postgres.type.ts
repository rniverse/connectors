// lib/core/postgres/postgres.type.ts

import type { LinkOptions } from '@shared/shared.type';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

/** A drizzle schema: `{ users, posts, ... }` from your schema file. */
export type PostgresSchema = Record<string, unknown>;

/**
 * postgres.js takes a URL, fields, or both — `postgres(url, options)`, fields
 * overriding the URL's parts. Passed through as given, never parsed. `url` or
 * `host` is required.
 */
export type PostgresConfig<TSchema extends PostgresSchema = PostgresSchema> =
	LinkOptions & {
		url?: string;
		host?: string;
		port?: number;
		database?: string;
		user?: string;
		password?: string;
		/** Pool settings, in seconds (as postgres.js). */
		pool?: {
			/** Default 20. */
			max?: number;
			/** Default 30. */
			idleTimeout?: number;
			/** Default 30. */
			connectionTimeout?: number;
			/** Default 3600. */
			maxLifetime?: number;
		};
		/** Prepared statements. Default true. */
		prepare?: boolean;
		/** Drizzle schema — enables relational queries (`db.query.users.findMany`). */
		schema?: TSchema;
		/** `application_name`. Required: this, else the `INSTANCE_NAME` env var. */
		appName?: string;
		/** Seconds `close()` waits for in-flight queries. Env `SQL_CLOSE_TIMEOUT_S`, default 5. */
		closeTimeout?: number;
		/** Raw server settings (GUCs); `application_name` comes from `appName`. */
		connection?: Record<string, string | number | boolean>;
	};

/** The drizzle database a Postgres connector hands out, with its postgres.js client. */
export type PostgresDatabase<TSchema extends PostgresSchema = PostgresSchema> =
	PostgresJsDatabase<TSchema> & { $client: Sql };

export type PostgresListenOptions = LinkOptions & {
	channel: string;
	/** A NOTIFY payload — parsed JSON when it parses, else the raw string. */
	onMessage: (payload: unknown) => void;
};
