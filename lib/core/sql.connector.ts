// lib/core/sql.connector.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { initORM } from '@tools/drizzle.tool';
import { HealthCheck } from '@tools/health.tool';
import type { HealthCheckOptions } from '@type/health.type';
import type { SQLConnectorConfig } from '@type/sql.type';

export class SQLConnector {
	private client: ReturnType<typeof initORM> | null = null;
	private config: SQLConnectorConfig;
	private connection = lazy(() => this.__connect());
	// Bumped by close(): a connect still in flight when close() runs sees the
	// change and discards its pool instead of reviving a closed connector.
	private epoch = 0;
	private checker: HealthCheck<void>;

	constructor(config: SQLConnectorConfig) {
		const { health, ...driver } = config;
		this.config = driver;
		this.checker = new HealthCheck({ name: 'SQL', target: this, health });
	}

	/**
	 * Connect to SQL database via Drizzle ORM.
	 * Creates the ORM client and verifies reachability with SELECT 1.
	 * Safe to call multiple times — subsequent calls return the same promise.
	 */
	async connect(): Promise<void> {
		return this.connection.get();
	}

	private async __connect(): Promise<void> {
		const epoch = this.epoch;
		const client = initORM(this.config);
		try {
			await client.$client`SELECT 1`;
			if (epoch !== this.epoch) {
				throw new Error('SQL connection closed while connecting');
			}
			this.client = client;
			log.info('SQL connected');
		} catch (err) {
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

	/**
	 * Reconnect if needed, ping with a time limit and retries, and trip the
	 * circuit after repeated failures — see `HealthCheck`. Never throws.
	 * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
	 */
	async health(options: HealthCheckOptions = {}): Promise<Result<void>> {
		return this.checker.check(options);
	}

	/** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
	get circuit(): BreakerState {
		return this.checker.state;
	}

	/**
	 * The health check's circuit breaker — for manual control (`open({ ms })`,
	 * `reset()`) and read-only state (`failures`, `remaining`). Use
	 * `health({ trial: true })` rather than `breaker.trial()` to test the
	 * connection now: it reconnects and pings.
	 */
	get breaker(): CircuitBreaker {
		return this.checker.breaker;
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
		this.epoch++;
		this.connection.reset();
		if (this.client) {
			await this.client.$client
				.end({ timeout: this.closeTimeout(options.timeout) })
				.catch((err: unknown) => {
					log.error(err, 'Error closing SQL connection');
				});
		}
		this.client = null;
		log.info('SQL connection closed');
	}
}
