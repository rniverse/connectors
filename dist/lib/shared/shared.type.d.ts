import type { Result } from '@rniverse/utils/result';
/**
 * Where a link is in its life.
 *
 * - `idle` — created, never connected
 * - `connecting` — connect in progress, or the driver is reconnecting
 * - `ready` — connected and able to do its job
 * - `failed` — connect or health check failed, the driver reported a failure,
 *   the circuit opened, or its connector failed
 * - `closed` — the owner called `close()`
 */
export type LinkState = 'idle' | 'connecting' | 'ready' | 'failed' | 'closed';
/** Every link's events and their payloads. */
export type LinkEventMap = {
    /** A new driver object connected — set it up (e.g. subscribe). */
    connect: {
        name: string;
    };
    /** Back to `ready` on the same driver object. */
    recover: {
        name: string;
    };
    /** → `failed`. */
    fail: {
        name: string;
        error: unknown;
    };
    /** → `closed` (the owner's close). */
    close: {
        name: string;
    };
};
/** A named handler for one event. Names are unique per link and event. */
export type Listener<Payload> = {
    name: string;
    handler: (event: Payload) => unknown;
};
/**
 * Health-check and circuit-breaker settings. Each falls back to its env var,
 * then the default.
 */
export type HealthOptions = {
    /** Pings per health check, including the first. Env `MAX_HEALTH_RETRIES`, default 3. */
    attempts?: number;
    /** ms each ping (incl. a first connect) may take. Env `HEALTH_TIMEOUT_MS`, default 2000. */
    timeout?: number;
    /** Consecutive failed checks that open the circuit. Env `CIRCUIT_THRESHOLD`, default 3. */
    threshold?: number;
    /** ms the circuit stays open before one trial check. Env `CIRCUIT_COOLDOWN_MS`, default 30000. */
    cooldown?: number;
};
/** Options every link takes. */
export type LinkOptions = {
    /** Required. Unique within its connector. */
    name: string;
    /** Extra connections default to their connector's settings. */
    health?: HealthOptions;
};
/** Options every connector takes. */
export type ConnectorOptions = LinkOptions & {
    /**
     * Re-check on a timer: `every` ms, connect when there's no driver object
     * yet, else `health()`. Env `RECOVER_EVERY_MS`, default off.
     */
    recover?: {
        every?: number;
    };
};
export type HealthCheckOptions = {
    /**
     * Run this check as the circuit breaker's trial now, instead of waiting out
     * the rest of the cooldown. Default false.
     */
    trial?: boolean;
};
/** What `HealthCheck` drives. */
export type HealthTarget<T> = {
    /** Create the driver object if there is none yet; a no-op otherwise. */
    connect(): Promise<unknown>;
    ping(): Promise<Result<T>>;
    /** The circuit opened — mark the link failed. Nothing is torn down. */
    trip(options: {
        error: unknown;
    }): void;
};
export type HealthCheckConfig<T> = {
    /** Shown in log lines. */
    name: string;
    target: HealthTarget<T>;
    health?: HealthOptions;
};
export type LinkErrorCode = 'DUPLICATE_NAME' | 'NOT_READY' | 'MISSING_APP_NAME' | 'UNKNOWN_NAME';
//# sourceMappingURL=shared.type.d.ts.map