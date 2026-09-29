import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { LinkError } from './errors.js';
import type { ConnectorOptions, HealthCheckOptions, HealthOptions, LinkEventMap, LinkOptions, LinkState, Listener } from './shared.type.js';
export type AnyLink = Link<any, any>;
/** What a link needs beyond the public `LinkOptions`. Internal. */
export type LinkInit = LinkOptions & {
    /** The connector an extra connection belongs to. */
    parent?: AnyLink;
    /** Health settings inherited from the connector; `health` overrides them. */
    defaults?: HealthOptions;
};
/**
 * A connector's extra connections of one kind, by name — read-only.
 * `get()` throws `UNKNOWN_NAME` for a name that isn't in the config.
 */
export declare class Links<T extends AnyLink> implements Iterable<T> {
    private readonly connector;
    private readonly items;
    constructor(options: {
        connector: string;
        items: ReadonlyMap<string, T>;
    });
    get(name: string): T;
    has(name: string): boolean;
    get size(): number;
    [Symbol.iterator](): Iterator<T>;
}
/**
 * Anything that holds a live connection — a connector, or an extra connection
 * of one. Owns everything common: idempotent connect (a close() mid-connect
 * wins), state, named listeners, the health check and circuit breaker. A
 * concrete link only says how to open, shut and ping its driver.
 *
 * The driver owns reconnecting: a link creates its driver object once, reports
 * state, and never destroys the object to recover it.
 */
export declare abstract class Link<Instance, Events extends LinkEventMap = LinkEventMap> {
    readonly name: string;
    /** The connector's name; a connector is its own. */
    readonly connector: string;
    private current;
    private instance;
    private announced;
    private epoch;
    private readonly connection;
    private readonly checker;
    private readonly handlers;
    private readonly upstream;
    private held;
    constructor(init: LinkInit);
    /** `name`, or `connector/name` for an extra connection — for log lines. */
    get label(): string;
    get state(): LinkState;
    get circuit(): BreakerState;
    /** open({ ms }), reset(), failures, remaining. */
    get breaker(): CircuitBreaker;
    /**
     * Add a named listener. A second one with the same name for the same event
     * throws `DUPLICATE_NAME`. `connect` on a link that's already `ready` runs
     * the handler once, right away.
     */
    on<T extends keyof Events & string>(type: T, listener: Listener<Events[T]>): void;
    off<T extends keyof Events & string>(type: T, options: {
        name: string;
    }): void;
    /**
     * Create the driver object and connect it — idempotent, concurrent calls
     * share one connect. A no-op when there already is one (the driver owns
     * reconnecting it). A closed link reopens with a fresh one. An extra
     * connection whose connector isn't ready logs a warning and returns: its
     * connector connects it once ready.
     */
    connect(): Promise<void>;
    /** The owner's close: extras first, then this link. */
    close(): Promise<void>;
    /** One raw check — no retry, no breaker. Never throws. */
    ping(): Promise<Result<unknown>>;
    /**
     * Connect if there's no driver object yet, ping with a time limit and
     * retries, count failures against the breaker. `{ trial: true }` runs the
     * breaker's trial now. A connector that passes also connects its extras
     * that have no driver object yet. Never throws.
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
    /** Extra connections of this link. Connectors override. */
    protected __extras(): AnyLink[];
    /** Whether a driver object exists. */
    protected get opened(): boolean;
    /** The current epoch — capture it when opening, pass it to `__mark`. */
    protected __epoch(): number;
    /**
     * A driver-reported state change. Ignored if it's from an older epoch,
     * before the open finished, or once the link is closed.
     */
    protected __mark(options: {
        state: LinkState;
        epoch: number;
        error?: unknown;
    }): void;
    /** Fire an event to every listener, in order. */
    protected __emit<T extends keyof Events & string>(type: T, event: Events[T]): void;
    protected __notReady(): LinkError;
    private __connect;
    private __state;
    /** This connector failed: take its live extras down with it — state only. */
    private __hold;
    /** This connector is ready again: give its extras back the state they had. */
    private __resume;
    /** Connect the extras that have no driver object yet (closed ones aside). */
    private __attach;
    /** One listener — a throw or a rejection is logged, never propagated. */
    private __call;
}
/**
 * A link that owns extra connections, declared in its config and created in
 * its constructor. It connects them once it's ready, closes them before
 * itself, and takes their state down with its own. Optionally re-checks
 * itself on a timer (`recover.every`).
 */
export declare abstract class Connector<Instance, Events extends LinkEventMap = LinkEventMap> extends Link<Instance, Events> {
    private readonly adopted;
    private readonly defaults;
    private readonly every;
    private timer;
    private passing;
    constructor(init: LinkInit & ConnectorOptions);
    connect(): Promise<void>;
    close(): Promise<void>;
    protected __extras(): AnyLink[];
    /** What every extra connection of this connector is created with. */
    protected __child(options: LinkOptions): LinkInit;
    /** Register a declared extra connection. Names are unique per connector. */
    protected __adopt<T extends AnyLink>(link: T): T;
    /** The extras of one class, by name. */
    protected __of<T extends AnyLink>(options: {
        kind: abstract new (...args: never[]) => T;
    }): Links<T>;
    /** Start the recover timer, once, if one is set. */
    private __watch;
    /**
     * One recover pass: connect while there's no driver object (bounded by the
     * driver's own connect timeout, not the health timeout), else `health()`.
     * Passes never overlap. Never throws.
     */
    private __pass;
}
//# sourceMappingURL=link.d.ts.map