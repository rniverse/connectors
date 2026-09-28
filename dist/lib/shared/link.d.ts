import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { LinkError } from './errors.js';
import type { HealthCheckOptions, HealthOptions, LinkOptions, LinkState } from './shared.type.js';
/** What a link needs beyond the public `LinkOptions`. Internal. */
export type LinkInit = LinkOptions & {
    /** The owning connector's name; a connector is its own. */
    connector?: string;
    /** Where an extra connection registers its name. */
    scope?: Scope;
    /** Health settings inherited from the connector; `health` overrides them. */
    defaults?: HealthOptions;
};
/**
 * A connector's registry of its extra connections. Names are unique within it;
 * a closed link leaves it (freeing the name), a failed one stays.
 */
export declare class Scope {
    private readonly links;
    readonly connector: string;
    constructor(options: {
        connector: string;
    });
    add(options: {
        link: Link<unknown>;
    }): void;
    remove(options: {
        link: Link<unknown>;
    }): void;
    list(): Link<unknown>[];
    /** The registered links of one class, by name. */
    of<T extends Link<unknown>>(options: {
        kind: abstract new (...args: never[]) => T;
    }): ReadonlyMap<string, T>;
}
/**
 * Anything that holds a live connection — a connector, or an extra connection
 * a connector opened. Owns everything common: idempotent connect (a close()
 * mid-connect wins), state and events, the health check, circuit breaker and
 * trial. A concrete link only says how to open, shut and ping its driver.
 */
export declare abstract class Link<Instance> {
    readonly name: string;
    readonly connector: string;
    private current;
    private instance;
    private epoch;
    private readonly connection;
    private reopening;
    private readonly checker;
    private readonly on;
    private readonly registry;
    constructor(init: LinkInit);
    /** `name`, or `connector/name` for an extra connection — for log lines. */
    get label(): string;
    get state(): LinkState;
    get circuit(): BreakerState;
    /** open({ ms }), reset(), failures, remaining — see the rewrite doc §3.6. */
    get breaker(): CircuitBreaker;
    /**
     * Idempotent: concurrent calls share one connect. A closed link reopens
     * (reclaiming its name). A failed link that still holds its old driver
     * object (the driver reported the failure) drops it first, so this opens a
     * fresh connection — the owner's way back.
     */
    connect(): Promise<void>;
    /** The owner's close: extras first, then this link. Frees the name. */
    close(): Promise<void>;
    /** One raw check — no retry, no breaker. Never throws. */
    ping(): Promise<Result<unknown>>;
    /**
     * Reconnect if needed, ping with a time limit and retries, count failures
     * against the breaker. `{ trial: true }` runs the breaker's trial now.
     * Never throws.
     */
    health(options?: HealthCheckOptions): Promise<Result<unknown>>;
    /**
     * The raw driver object — available once `connect()` has resolved,
     * whatever the state. Throws `NOT_READY` only when there is none.
     */
    getInstance(): Instance;
    protected abstract __open(): Promise<Instance>;
    protected abstract __shut(options: {
        instance: Instance;
    }): Promise<void>;
    protected abstract __ping(options: {
        instance: Instance;
    }): Promise<Result<unknown>>;
    /** State once opened. A Kafka consumer overrides: `connecting` until it joins its group. */
    protected __settled(): LinkState;
    /** Extra connections to close / release with this link. Connectors override. */
    protected __extras(): Link<unknown>[];
    /** The current epoch — capture it when opening, pass it to `__mark`. */
    protected __epoch(): number;
    /** A driver-reported state change. Ignored if it's from an older epoch or the link is closed. */
    protected __mark(options: {
        state: LinkState;
        epoch: number;
        error?: unknown;
    }): void;
    protected __notReady(): LinkError;
    private __connect;
    /** The breaker's release: drop the connection, keep the name, go `failed`. */
    private __release;
    private __drop;
    private __state;
    /** An owner's handler must never break the link — sync throw or async rejection. */
    private __emit;
}
/**
 * A link that opens extra connections. Holds their scope: closes them before
 * itself, releases them when its own breaker releases it.
 */
export declare abstract class Connector<Instance> extends Link<Instance> {
    protected readonly scope: Scope;
    protected readonly defaults: HealthOptions;
    constructor(init: LinkInit);
    protected __extras(): Link<unknown>[];
    /** What every extra connection of this connector is created with. */
    protected __child(options: LinkOptions): LinkInit;
}
//# sourceMappingURL=link.d.ts.map