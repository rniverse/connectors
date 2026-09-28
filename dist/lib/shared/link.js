// lib/shared/link.ts
import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import { LinkError } from './errors.js';
import { HealthCheck } from './health.js';
/**
 * A connector's registry of its extra connections. Names are unique within it;
 * a closed link leaves it (freeing the name), a failed one stays.
 */
export class Scope {
    links = new Map();
    connector;
    constructor(options) {
        this.connector = options.connector;
    }
    add(options) {
        const { link } = options;
        const held = this.links.get(link.name);
        if (held && held !== link) {
            throw new LinkError({
                code: 'DUPLICATE_NAME',
                link: link.name,
                connector: this.connector,
                message: `${this.connector}: a link named '${link.name}' already exists`,
            });
        }
        this.links.set(link.name, link);
    }
    remove(options) {
        if (this.links.get(options.link.name) === options.link) {
            this.links.delete(options.link.name);
        }
    }
    list() {
        return [...this.links.values()];
    }
    /** The registered links of one class, by name. */
    of(options) {
        const found = new Map();
        for (const [name, link] of this.links) {
            if (link instanceof options.kind)
                found.set(name, link);
        }
        return found;
    }
}
/**
 * Anything that holds a live connection — a connector, or an extra connection
 * a connector opened. Owns everything common: idempotent connect (a close()
 * mid-connect wins), state and events, the health check, circuit breaker and
 * trial. A concrete link only says how to open, shut and ping its driver.
 */
export class Link {
    name;
    connector;
    current = 'idle';
    instance = null;
    // Bumped by close() / release: anything started under an older epoch — an
    // in-flight connect, a stale driver event — is ignored.
    epoch = 0;
    connection = lazy(() => this.__connect());
    // A failed link's old connection being dropped by connect() — shared by
    // concurrent connect() calls so only one drop happens.
    reopening = null;
    checker;
    on;
    // The connector scope this link is registered in (extra connections only).
    registry;
    constructor(init) {
        this.name = init.name;
        this.connector = init.connector ?? init.name;
        this.on = init.on ?? {};
        this.registry = init.scope ?? null;
        this.registry?.add({ link: this });
        this.checker = new HealthCheck({
            name: this.label,
            target: {
                // The existing connection, or a first one — a health check never
                // throws away a working driver object; only the breaker releases.
                connect: () => this.connection.get(),
                ping: () => this.ping(),
                release: (options) => this.__release(options),
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
    /** open({ ms }), reset(), failures, remaining — see the rewrite doc §3.6. */
    get breaker() {
        return this.checker.breaker;
    }
    /**
     * Idempotent: concurrent calls share one connect. A closed link reopens
     * (reclaiming its name). A failed link that still holds its old driver
     * object (the driver reported the failure) drops it first, so this opens a
     * fresh connection — the owner's way back.
     */
    async connect() {
        if (this.current === 'closed')
            this.registry?.add({ link: this });
        if (this.current === 'failed' && this.instance && !this.reopening) {
            this.reopening = this.__drop({
                extras: 'release',
                error: new Error(`${this.label}: reconnecting`),
            }).finally(() => {
                this.reopening = null;
            });
        }
        if (this.reopening)
            await this.reopening;
        return this.connection.get();
    }
    /** The owner's close: extras first, then this link. Frees the name. */
    async close() {
        await this.__drop({ extras: 'close' });
        this.__state({ state: 'closed' });
        this.registry?.remove({ link: this });
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
     * Reconnect if needed, ping with a time limit and retries, count failures
     * against the breaker. `{ trial: true }` runs the breaker's trial now.
     * Never throws.
     */
    async health(options = {}) {
        if (this.current === 'closed') {
            return { ok: false, error: this.__notReady() };
        }
        const result = await this.checker.check(options);
        if (result.ok) {
            if (this.current === 'failed' && this.instance) {
                this.__state({ state: this.__settled() });
            }
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
    /** State once opened. A Kafka consumer overrides: `connecting` until it joins its group. */
    __settled() {
        return 'ready';
    }
    /** Extra connections to close / release with this link. Connectors override. */
    __extras() {
        return [];
    }
    /** The current epoch — capture it when opening, pass it to `__mark`. */
    __epoch() {
        return this.epoch;
    }
    /** A driver-reported state change. Ignored if it's from an older epoch or the link is closed. */
    __mark(options) {
        if (options.epoch !== this.epoch || this.current === 'closed')
            return;
        this.__state({ state: options.state, error: options.error });
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
        this.__state({ state: this.__settled() });
    }
    /** The breaker's release: drop the connection, keep the name, go `failed`. */
    async __release(options) {
        await this.__drop({ extras: 'release', error: options.error });
        this.__state({ state: 'failed', error: options.error });
    }
    async __drop(options) {
        this.epoch++;
        this.connection.reset();
        for (const extra of this.__extras()) {
            if (options.extras === 'close')
                await extra.close();
            else
                await extra.__release({ error: options.error });
        }
        const instance = this.instance;
        this.instance = null;
        if (instance) {
            await this.__shut({ instance }).catch((error) => {
                log.error(error, `${this.label}: shutting the connection failed`);
            });
        }
    }
    __state(options) {
        if (this.current === options.state)
            return;
        this.current = options.state;
        const event = { name: this.name };
        if (options.state === 'ready') {
            log.info(`${this.label}: ready`);
            this.__emit(() => this.on.connect?.(event));
        }
        else if (options.state === 'failed') {
            log.warn({ err: options.error }, `${this.label}: failed`);
            this.__emit(() => this.on.fail?.({ ...event, error: options.error }));
        }
        else if (options.state === 'closed') {
            log.info(`${this.label}: closed`);
            this.__emit(() => this.on.close?.(event));
        }
    }
    /** An owner's handler must never break the link — sync throw or async rejection. */
    __emit(handler) {
        try {
            Promise.resolve(handler()).catch((error) => {
                log.error(error, `${this.label}: event handler failed`);
            });
        }
        catch (error) {
            log.error(error, `${this.label}: event handler failed`);
        }
    }
}
/**
 * A link that opens extra connections. Holds their scope: closes them before
 * itself, releases them when its own breaker releases it.
 */
export class Connector extends Link {
    scope;
    defaults;
    constructor(init) {
        super(init);
        this.scope = new Scope({ connector: this.name });
        this.defaults = { ...init.health };
    }
    __extras() {
        return this.scope.list();
    }
    /** What every extra connection of this connector is created with. */
    __child(options) {
        return {
            ...options,
            connector: this.name,
            scope: this.scope,
            defaults: this.defaults,
        };
    }
}
//# sourceMappingURL=link.js.map