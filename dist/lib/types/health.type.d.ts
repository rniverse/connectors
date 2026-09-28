import type { Result } from '@rniverse/utils/result';
/**
 * Health-check and circuit-breaker settings, shared by every connector. Each
 * option falls back to its env var, then the built-in default.
 */
export type HealthOptions = {
    /** Pings per health check, including the first. Env `MAX_HEALTH_RETRIES`, default 3. */
    attempts?: number;
    /** ms each ping (incl. a reconnect) may take. Env `HEALTH_TIMEOUT_MS`, default 2000. */
    timeout?: number;
    /** Consecutive failed checks that open the circuit. Env `CIRCUIT_THRESHOLD`, default 3. */
    threshold?: number;
    /** ms the circuit stays open before one trial check. Env `CIRCUIT_COOLDOWN_MS`, default 30000. */
    cooldown?: number;
};
/** What a connector exposes for its health check. */
export type HealthTarget<T> = {
    connect(): Promise<unknown>;
    ping(): Promise<Result<T>>;
    close(): Promise<void>;
};
export type HealthCheckConfig<T> = {
    /** Shown in log lines, e.g. `SQL`, `Redpanda`. */
    name: string;
    target: HealthTarget<T>;
    health?: HealthOptions;
};
export type HealthCheckOptions = {
    /**
     * Run this check as the circuit breaker's trial now, instead of waiting out
     * the rest of the cooldown ("check now"). Default false.
     */
    trial?: boolean;
};
//# sourceMappingURL=health.type.d.ts.map