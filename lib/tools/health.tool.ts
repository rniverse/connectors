// lib/tools/health.tool.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import {
	type BreakerState,
	CircuitBreaker,
	type Outcome,
	retry,
	timeout,
} from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import type {
	HealthCheckConfig,
	HealthCheckOptions,
	HealthTarget,
} from '../types/health.type';

/** A ping that resolved `{ ok: false }` is as much a failure as one that threw. */
const failed = (result: Outcome<unknown>): boolean =>
	!result.ok || (result.data as Result<unknown>).ok === false;

/** An explicit option, else its env var, else the default. */
const setting = (options: {
	value: number | undefined;
	env: string;
	min: number;
	fallback: number;
}): number =>
	options.value ??
	boundedParseInt(environment.get(options.env), {
		min: options.min,
		fallback: options.fallback,
	});

/**
 * One connector's health check: reconnect if needed, ping with a time limit,
 * retry a few times, and trip a circuit breaker after repeated failed checks.
 *
 * - While the circuit is open, `check()` fails immediately — no ping, no wait.
 * - Opening the circuit closes the connection, freeing its pool / sockets.
 * - After `cooldown`, the next check is the breaker's single trial: `connect()`
 *   runs again (it's a no-op while connected), so a recovered dependency comes
 *   back without anything else having to reconnect it.
 *
 * `check()` never throws — every failure comes back as `{ ok: false, error }`.
 */
export class HealthCheck<T = unknown> {
	readonly breaker: CircuitBreaker;
	private readonly attempts: number;
	private readonly timeout: number;
	// The close() started when the circuit opened — awaited before check()
	// returns, so a caller never sees "open" with the connection still up.
	private closing: Promise<void> | null = null;

	private readonly name: string;
	private readonly target: HealthTarget<T>;

	constructor(config: HealthCheckConfig<T>) {
		const { name, target, health = {} } = config;
		this.name = name;
		this.target = target;
		this.attempts = setting({
			value: health.attempts,
			env: 'MAX_HEALTH_RETRIES',
			min: 1,
			fallback: 3,
		});
		this.timeout = setting({
			value: health.timeout,
			env: 'HEALTH_TIMEOUT_MS',
			min: 0,
			fallback: 2_000,
		});
		this.breaker = new CircuitBreaker({
			threshold: setting({
				value: health.threshold,
				env: 'CIRCUIT_THRESHOLD',
				min: 1,
				fallback: 3,
			}),
			cooldown: setting({
				value: health.cooldown,
				env: 'CIRCUIT_COOLDOWN_MS',
				min: 0,
				fallback: 30_000,
			}),
			trips: failed,
			on: {
				open: ({ failures }) => {
					log.warn(
						{ failures },
						`${this.name} circuit open — closing connection`,
					);
					this.closing = this.target.close().catch((error) => {
						log.error(error, `${this.name} close after circuit open failed`);
					});
				},
				close: () => log.info(`${this.name} circuit closed — healthy again`),
			},
		});
	}

	get state(): BreakerState {
		return this.breaker.state;
	}

	/**
	 * `{ trial: true }` runs this check as the breaker's trial now, skipping the
	 * rest of the cooldown — reconnect + ping immediately. Same single-trial
	 * rules; while closed it's just a normal check.
	 */
	async check(options: HealthCheckOptions = {}): Promise<Result<T>> {
		// The breaker wraps the whole check, retries included — `threshold`
		// counts failed *checks*, not failed pings. (`resilient` puts retry
		// outside the breaker, which would count every ping; wrong here.)
		const attempt = () =>
			timeout(async () => {
				await this.target.connect();
				return this.target.ping();
			}, this.timeout);
		const guarded = options.trial
			? this.breaker.trial.bind(this.breaker)
			: this.breaker.run.bind(this.breaker);
		try {
			return await guarded(() =>
				retry(attempt, {
					attempts: this.attempts,
					retryable: failed,
					on: {
						retry: ({ attempt, attempts }) =>
							log.warn(
								`${this.name} health check failed, retrying... (${attempt}/${attempts})`,
							),
					},
				}),
			);
		} catch (error) {
			return { ok: false, error };
		} finally {
			const closing = this.closing;
			this.closing = null;
			await closing;
		}
	}
}
