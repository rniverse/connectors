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
export declare class CircuitBreaker {
    private failures;
    private openedAt;
    private readonly threshold;
    private readonly cooldownMs;
    constructor(options?: CircuitBreakerOptions);
    get state(): CircuitState;
    /** Record a health-check outcome. Returns `true` if this call opened the circuit. */
    record(ok: boolean): boolean;
    reset(): void;
}
//# sourceMappingURL=circuit-breaker.tool.d.ts.map