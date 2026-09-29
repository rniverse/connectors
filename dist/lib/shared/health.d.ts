import { type BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import type { HealthCheckConfig, HealthCheckOptions } from './shared.type.js';
/**
 * One connector's health check: reconnect if needed, ping with a time limit,
 * retry a few times, and trip a circuit breaker after repeated failed checks.
 *
 * - While the circuit is open, `check()` fails immediately — no ping, no wait.
 * - Opening the circuit marks the link failed (`trip`) and destroys nothing:
 *   the driver keeps reconnecting underneath.
 * - After `cooldown`, the next check is the breaker's single trial — a plain
 *   ping on the same driver object (`connect()` only creates one if there's
 *   none yet).
 *
 * `check()` never throws — every failure comes back as `{ ok: false, error }`.
 */
export declare class HealthCheck<T = unknown> {
    readonly breaker: CircuitBreaker;
    private readonly attempts;
    private readonly timeout;
    private readonly name;
    private readonly target;
    constructor(config: HealthCheckConfig<T>);
    get state(): BreakerState;
    /**
     * `{ trial: true }` runs this check as the breaker's trial now, skipping the
     * rest of the cooldown — ping immediately. Same single-trial
     * rules; while closed it's just a normal check.
     */
    check(options?: HealthCheckOptions): Promise<Result<T>>;
}
//# sourceMappingURL=health.d.ts.map