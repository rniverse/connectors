// lib/tools/circuit-breaker.tool.ts

import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitBreakerOptions = {
	/** Consecutive failed health checks before the circuit opens.
	 *  Default: `CIRCUIT_THRESHOLD` env, else 1. */
	threshold?: number;
	/** Time the circuit stays open before a probe is worthwhile, in ms.
	 *  Default: `CIRCUIT_COOLDOWN_MS` env, else 30000. */
	cooldownMs?: number;
};

/**
 * Per-connector health signal. When `threshold` consecutive health checks fail
 * the circuit "opens" and the connector closes its own connection to free
 * resources (pool, sockets, reconnect timers) — nothing else is touched. After
 * `cooldownMs` the state becomes `half-open`, meaning a fresh `connect()` is
 * worth trying. A passing check closes the circuit again.
 *
 * It never blocks a call itself; `state` is a signal a caller can poll.
 *
 * `new CircuitBreaker()` reads its config from the environment; pass options to
 * override.
 */
export class CircuitBreaker {
	private failures = 0;
	private openedAt: number | null = null;
	private readonly threshold: number;
	private readonly cooldownMs: number;

	constructor(options: CircuitBreakerOptions = {}) {
		this.threshold =
			options.threshold ??
			boundedParseInt(environment.get('CIRCUIT_THRESHOLD'), {
				min: 1,
				fallback: 1,
			});
		this.cooldownMs =
			options.cooldownMs ??
			boundedParseInt(environment.get('CIRCUIT_COOLDOWN_MS'), {
				min: 0,
				fallback: 30_000,
			});
	}

	get state(): CircuitState {
		if (this.openedAt === null) return 'closed';
		return Date.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
	}

	/** Record a health-check outcome. Returns `true` if this call opened the circuit. */
	record(ok: boolean): boolean {
		if (ok) {
			this.reset();
			return false;
		}
		this.failures++;
		if (this.failures >= this.threshold && this.openedAt === null) {
			this.openedAt = Date.now();
			return true;
		}
		return false;
	}

	reset(): void {
		this.failures = 0;
		this.openedAt = null;
	}
}
