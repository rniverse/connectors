// lib/shared/link.ts
import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import { LinkError } from './errors.js';
import { HealthCheck } from './health.js';
import { setting } from './setting.js';
/**
 * A connector's extra connections of one kind, by name — read-only.
 * `get()` throws `UNKNOWN_NAME` for a name that isn't in the config.
 */
export class Links {
    connector;
    items;
    constructor(options) {
        this.connector = options.connector;
        this.items = options.items;
    }
    get(name) {
        const link = this.items.get(name);
        if (!link) {
            throw new LinkError({
                code: 'UNKNOWN_NAME',
                link: name,
                connector: this.connector,
                message: `${this.connector}: no link named '${name}' in its config`,
            });
        }
        return link;
    }
    has(name) {
        return this.items.has(name);
    }
    get size() {
        return this.items.size;
    }
    [Symbol.iterator]() {
        return this.items.values();
    }
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
export class Link {
    name;
    /** The connector's name; a connector is its own. */
    connector;
    current = 'idle';
    instance = null;
    // The driver object `connect` last fired for — a later `ready` on the same
    // object fires `recover` instead.
    announced = null;
    // Bumped by close(): anything started under an older epoch — an in-flight
    // connect, a stale driver event — is ignored.
    epoch = 0;
    connection = lazy(() => this.__connect());
    checker;
    handlers = new Map();
    upstream;
    // The state this extra had when its connector failed and took it down —
    // restored when the connector is ready again. Cleared by its own driver.
    held = null;
    constructor(init) {
        this.name = init.name;
        this.upstream = init.parent ?? null;
        this.connector = this.upstream?.name ?? init.name;
        this.checker = new HealthCheck({
            name: this.label,
            target: {
                connect: () => this.connection.get(),
                ping: () => this.ping(),
                trip: (options) => this.__state({ state: 'failed', ...options }),
            },
            health: { ...init.defaults, ...init.health },
        });
    }
    /** `name`, or `connector/name` for an extra connection — for log lines. */
    get label() {
        return this.connector === this.name
            ? this.name
            : `${this.connector}/${this.name}`;
    }
    get state() {
        return this.current;
    }
    get circuit() {
        return this.checker.state;
    }
    /** open({ ms }), reset(), failures, remaining. */
    get breaker() {
        return this.checker.breaker;
    }
    /**
     * Add a named listener. A second one with the same name for the same event
     * throws `DUPLICATE_NAME`. `connect` on a link that's already `ready` runs
     * the handler once, right away.
     */
    on(type, listener) {
        const named = this.handlers.get(type) ?? new Map();
        if (named.has(listener.name)) {
            throw new LinkError({
                code: 'DUPLICATE_NAME',
                link: this.name,
                connector: this.connector,
                message: `${this.label}: a '${type}' listener named '${listener.name}' already exists`,
            });
        }
        const handler = listener.handler;
        named.set(listener.name, handler);
        this.handlers.set(type, named);
        if (type === 'connect' && this.current === 'ready') {
            this.__call({
                type,
                name: listener.name,
                handler,
                event: { name: this.name },
            });
        }
    }
    off(type, options) {
        this.handlers.get(type)?.delete(options.name);
    }
    /**
     * Create the driver object and connect it — idempotent, concurrent calls
     * share one connect. A no-op when there already is one (the driver owns
     * reconnecting it). A closed link reopens with a fresh one. An extra
     * connection whose connector isn't ready logs a warning and returns: its
     * connector connects it once ready.
     */
    async connect() {
        if (this.current === 'closed')
            this.__state({ state: 'idle' });
        const upstream = this.upstream;
        if (upstream && upstream.state !== 'ready') {
            log.warn(`${this.label}: waiting — ${upstream.name} is ${upstream.state}`);
            return;
        }
        return this.connection.get();
    }
    /** The owner's close: extras first, then this link. */
    async close() {
        this.epoch++;
        this.connection.reset();
        for (const extra of this.__extras())
            await extra.close();
        const instance = this.instance;
        this.instance = null;
        this.announced = null;
        this.held = null;
        if (instance) {
            await this.__shut({ instance }).catch((error) => {
                log.error(error, `${this.label}: shutting the connection failed`);
            });
        }
        this.__state({ state: 'closed' });
    }
    /** One raw check — no retry, no breaker. Never throws. */
    async ping() {
        const instance = this.instance;
        if (!instance)
            return { ok: false, error: this.__notReady() };
        try {
            return await this.__ping({ instance });
        }
        catch (error) {
            return { ok: false, error };
        }
    }
    /**
     * Connect if there's no driver object yet, ping with a time limit and
     * retries, count failures against the breaker. `{ trial: true }` runs the
     * breaker's trial now. A connector that passes also connects its extras
     * that have no driver object yet. Never throws.
     */
    async health(options = {}) {
        if (this.current === 'closed') {
            return { ok: false, error: this.__notReady() };
        }
        const result = await this.checker.check(options);
        if (result.ok) {
            if (this.current === 'failed' && this.instance) {
                this.__state({ state: 'ready' });
            }
            this.__attach();
        }
        else if (this.current === 'ready') {
            this.__state({ state: 'failed', error: result.error });
        }
        return result;
    }
    /**
     * The raw driver object — available once `connect()` has resolved,
     * whatever the state. Throws `NOT_READY` only when there is none.
     */
    getInstance() {
        if (!this.instance)
            throw this.__notReady();
        return this.instance;
    }
    /** Extra connections of this link. Connectors override. */
    __extras() {
        return [];
    }
    /** Whether a driver object exists. */
    get opened() {
        return this.instance !== null;
    }
    /** The current epoch — capture it when opening, pass it to `__mark`. */
    __epoch() {
        return this.epoch;
    }
    /**
     * A driver-reported state change. Ignored if it's from an older epoch,
     * before the open finished, or once the link is closed.
     */
    __mark(options) {
        if (options.epoch !== this.epoch || this.current === 'closed')
            return;
        if (!this.instance)
            return;
        // The driver has spoken — it wins over what the connector took down.
        this.held = null;
        this.__state({ state: options.state, error: options.error });
    }
    /** Fire an event to every listener, in order. */
    __emit(type, event) {
        const named = this.handlers.get(type);
        if (!named)
            return;
        for (const [name, handler] of named) {
            this.__call({ type, name, handler, event });
        }
    }
    __notReady() {
        return new LinkError({
            code: 'NOT_READY',
            link: this.name,
            connector: this.connector,
            message: `${this.label}: not connected`,
        });
    }
    // ── internals ─────────────────────────────────────────────────────────
    async __connect() {
        const epoch = this.epoch;
        this.__state({ state: 'connecting' });
        let instance;
        try {
            instance = await this.__open();
        }
        catch (error) {
            if (epoch === this.epoch)
                this.__state({ state: 'failed', error });
            throw error;
        }
        if (epoch !== this.epoch) {
            await this.__shut({ instance }).catch((error) => {
                log.error(error, `${this.label}: shutting a superseded connection failed`);
            });
            throw new LinkError({
                code: 'NOT_READY',
                link: this.name,
                connector: this.connector,
                message: `${this.label}: closed while connecting`,
            });
        }
        this.instance = instance;
        this.__state({ state: 'ready' });
    }
    __state(options) {
        if (this.current === options.state)
            return;
        this.current = options.state;
        const event = { name: this.name };
        if (options.state === 'ready') {
            const fresh = this.announced !== this.instance;
            this.announced = this.instance;
            log.info(`${this.label}: ${fresh ? 'ready' : 'recovered'}`);
            this.__emit(fresh ? 'connect' : 'recover', event);
            this.__resume();
            this.__attach();
        }
        else if (options.state === 'failed') {
            log.warn({ err: options.error }, `${this.label}: failed`);
            this.__emit('fail', { ...event, error: options.error });
            this.__hold({ error: options.error });
        }
        else if (options.state === 'closed') {
            log.info(`${this.label}: closed`);
            this.__emit('close', event);
        }
    }
    /** This connector failed: take its live extras down with it — state only. */
    __hold(options) {
        for (const extra of this.__extras()) {
            if (extra.current !== 'ready' && extra.current !== 'connecting')
                continue;
            extra.held = extra.current;
            extra.__state({ state: 'failed', error: options.error });
        }
    }
    /** This connector is ready again: give its extras back the state they had. */
    __resume() {
        for (const extra of this.__extras()) {
            const held = extra.held;
            extra.held = null;
            if (held && extra.current === 'failed')
                extra.__state({ state: held });
        }
    }
    /** Connect the extras that have no driver object yet (closed ones aside). */
    __attach() {
        if (this.current !== 'ready')
            return;
        for (const extra of this.__extras()) {
            if (extra.instance || extra.current === 'closed')
                continue;
            extra.connect().catch((error) => {
                log.warn(error, `${extra.label}: connect failed`);
            });
        }
    }
    /** One listener — a throw or a rejection is logged, never propagated. */
    __call(options) {
        const { type, name, handler, event } = options;
        const failed = (error) => log.error(error, `${this.label}: listener '${name}' (${type}) failed`);
        try {
            Promise.resolve(handler(event)).catch(failed);
        }
        catch (error) {
            failed(error);
        }
    }
}
/**
 * A link that owns extra connections, declared in its config and created in
 * its constructor. It connects them once it's ready, closes them before
 * itself, and takes their state down with its own. Optionally re-checks
 * itself on a timer (`recover.every`).
 */
export class Connector extends Link {
    adopted = new Map();
    defaults;
    every;
    timer = null;
    passing = false;
    constructor(init) {
        super(init);
        this.defaults = { ...init.health };
        this.every = setting({
            value: init.recover?.every,
            env: 'RECOVER_EVERY_MS',
            min: 0,
            fallback: 0,
        });
    }
    async connect() {
        this.__watch();
        return super.connect();
    }
    async close() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        return super.close();
    }
    __extras() {
        return [...this.adopted.values()];
    }
    /** What every extra connection of this connector is created with. */
    __child(options) {
        return { ...options, parent: this, defaults: this.defaults };
    }
    /** Register a declared extra connection. Names are unique per connector. */
    __adopt(link) {
        if (this.adopted.has(link.name)) {
            throw new LinkError({
                code: 'DUPLICATE_NAME',
                link: link.name,
                connector: this.name,
                message: `${this.name}: a link named '${link.name}' already exists`,
            });
        }
        this.adopted.set(link.name, link);
        return link;
    }
    /** The extras of one class, by name. */
    __of(options) {
        const items = new Map();
        for (const [name, link] of this.adopted) {
            if (link instanceof options.kind)
                items.set(name, link);
        }
        return new Links({ connector: this.name, items });
    }
    /** Start the recover timer, once, if one is set. */
    __watch() {
        if (this.timer || this.every <= 0)
            return;
        this.timer = setInterval(() => void this.__pass(), this.every);
        this.timer.unref?.();
    }
    /**
     * One recover pass: connect while there's no driver object (bounded by the
     * driver's own connect timeout, not the health timeout), else `health()`.
     * Passes never overlap. Never throws.
     */
    async __pass() {
        if (this.passing || this.state === 'closed')
            return;
        this.passing = true;
        try {
            if (this.opened)
                await this.health();
            else
                await super.connect().catch((error) => {
                    log.warn(error, `${this.label}: connect failed`);
                });
        }
        finally {
            this.passing = false;
        }
    }
}
//# sourceMappingURL=link.js.map