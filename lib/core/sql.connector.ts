// lib/core/sql.connector.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker, type CircuitState } from '@tools/circuit-breaker.tool';
import { initORM } from '@tools/drizzle.tool';
import type { SQLConnectorConfig } from '@type/sql.type';

export class SQLConnector {
	private client: ReturnType<typeof initORM> | null = null;
	private config: SQLConnectorConfig;
	private init_promise: Promise<void> | null = null;
	private breaker = new CircuitBreaker();

	constructor(config: SQLConnectorConfig) {
		this.config = config;
	}

	/**
	 * Connect to SQL database via Drizzle ORM.
	 * Creates the ORM client and verifies reachability with SELECT 1.
	 * Safe to call multiple times — subsequent calls return the same promise.
	 */
	async connect(): Promise<void> {
		if (!this.init_promise) {
			this.init_promise = this.__connect();
		}
		return this.init_promise;
	}

	private async __connect(): Promise<void> {
		const client = initORM(this.config);
		try {
			await client.$client`SELECT 1`;
			this.client = client;
			this.breaker.reset();
			log.info('SQL connected');
		} catch (err) {
			this.init_promise = null; // allow retry on failure
			// The pool was created before the reachability check; close it so we
			// don't leak connections / a reconnect timer on failure.
			await client.$client
				.end({ timeout: this.closeTimeout() })
				.catch((endErr: unknown) => {
					log.error(endErr, 'Error closing SQL pool after failed connect');
				});
			log.error(err, 'SQL connection failed');
			throw err;
		}
	}

	private require_client() {
		if (!this.client)
			throw new Error('SQL not connected — call connect() first');
		return this.client;
	}

	/**
	 * Grace period, in seconds, that postgres.js `end()` waits for in-flight
	 * queries to finish before force-closing connections. Explicit value wins,
	 * else `SQL_CLOSE_TIMEOUT_S`, else 5. `0` = force-close immediately.
	 */
	private closeTimeout(explicit?: number): number {
		return (
			explicit ??
			boundedParseInt(environment.get('SQL_CLOSE_TIMEOUT_S'), {
				min: 0,
				fallback: 5,
			})
		);
	}

	async ping(): Promise<Result<void>> {
		try {
			await this.require_client().$client`SELECT 1`;
			return { ok: true as const };
		} catch (err) {
			log.error(err, 'SQL ping failed');
			return { ok: false as const, error: err };
		}
	}

	async health(): Promise<Result<void>> {
		const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
			min: 1,
			fallback: 3,
		});
		const result = await retry(() => this.ping(), {
			attempts,
			retryIf: (o) => o.ok && o.value.ok === false,
			onRetry: (_o, attempt) =>
				log.warn(
					`SQL health check failed, retrying... (${attempt}/${attempts})`,
				),
		});
		// Only tear the pool down once the breaker actually trips; a single bad
		// check with CIRCUIT_THRESHOLD > 1 leaves the connection up to retry.
		if (this.breaker.record(result.ok)) await this.close();
		return result;
	}

	/** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
	get circuit(): CircuitState {
		return this.breaker.state;
	}

	getInstance() {
		return this.require_client();
	}

	/**
	 * @param options.timeout seconds to wait for in-flight queries before
	 * force-closing. Omit to use `SQL_CLOSE_TIMEOUT_S` (default 5); `0` closes
	 * immediately.
	 */
	async close(options: { timeout?: number } = {}): Promise<void> {
		if (this.client) {
			await this.client.$client
				.end({ timeout: this.closeTimeout(options.timeout) })
				.catch((err: unknown) => {
					log.error(err, 'Error closing SQL connection');
				});
		}
		this.client = null;
		this.init_promise = null;
		log.info('SQL connection closed');
	}
}
