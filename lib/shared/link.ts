// lib/shared/link.ts

import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import type { BreakerState, CircuitBreaker } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { LinkError } from './errors';
import { HealthCheck } from './health';
import type {
	HealthCheckOptions,
	HealthOptions,
	LinkEvents,
	LinkOptions,
	LinkState,
} from './shared.type';

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
export class Scope {
	private readonly links = new Map<string, Link<unknown>>();
	readonly connector: string;

	constructor(options: { connector: string }) {
		this.connector = options.connector;
	}

	add(options: { link: Link<unknown> }): void {
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

	remove(options: { link: Link<unknown> }): void {
		if (this.links.get(options.link.name) === options.link) {
			this.links.delete(options.link.name);
		}
	}

	list(): Link<unknown>[] {
		return [...this.links.values()];
	}

	/** The registered links of one class, by name. */
	of<T extends Link<unknown>>(options: {
		kind: abstract new (...args: never[]) => T;
	}): ReadonlyMap<string, T> {
		const found = new Map<string, T>();
		for (const [name, link] of this.links) {
			if (link instanceof options.kind) found.set(name, link as T);
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
export abstract class Link<Instance> {
	readonly name: string;
	readonly connector: string;
	private current: LinkState = 'idle';
	private instance: Instance | null = null;
	// Bumped by close() / release: anything started under an older epoch — an
	// in-flight connect, a stale driver event — is ignored.
	private epoch = 0;
	private readonly connection = lazy(() => this.__connect());
	// A failed link's old connection being dropped by connect() — shared by
	// concurrent connect() calls so only one drop happens.
	private reopening: Promise<void> | null = null;
	private readonly checker: HealthCheck<unknown>;
	private readonly on: LinkEvents;
	// The connector scope this link is registered in (extra connections only).
	private readonly registry: Scope | null;

	constructor(init: LinkInit) {
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
	get label(): string {
		return this.connector === this.name
			? this.name
			: `${this.connector}/${this.name}`;
	}

	get state(): LinkState {
		return this.current;
	}

	get circuit(): BreakerState {
		return this.checker.state;
	}

	/** open({ ms }), reset(), failures, remaining — see the rewrite doc §3.6. */
	get breaker(): CircuitBreaker {
		return this.checker.breaker;
	}

	/**
	 * Idempotent: concurrent calls share one connect. A closed link reopens
	 * (reclaiming its name). A failed link that still holds its old driver
	 * object (the driver reported the failure) drops it first, so this opens a
	 * fresh connection — the owner's way back.
	 */
	async connect(): Promise<void> {
		if (this.current === 'closed') this.registry?.add({ link: this });
		if (this.current === 'failed' && this.instance && !this.reopening) {
			this.reopening = this.__drop({
				extras: 'release',
				error: new Error(`${this.label}: reconnecting`),
			}).finally(() => {
				this.reopening = null;
			});
		}
		if (this.reopening) await this.reopening;
		return this.connection.get();
	}

	/** The owner's close: extras first, then this link. Frees the name. */
	async close(): Promise<void> {
		await this.__drop({ extras: 'close' });
		this.__state({ state: 'closed' });
		this.registry?.remove({ link: this });
	}

	/** One raw check — no retry, no breaker. Never throws. */
	async ping(): Promise<Result<unknown>> {
		const instance = this.instance;
		if (!instance) return { ok: false, error: this.__notReady() };
		try {
			return await this.__ping({ instance });
		} catch (error) {
			return { ok: false, error };
		}
	}

	/**
	 * Reconnect if needed, ping with a time limit and retries, count failures
	 * against the breaker. `{ trial: true }` runs the breaker's trial now.
	 * Never throws.
	 */
	async health(options: HealthCheckOptions = {}): Promise<Result<unknown>> {
		if (this.current === 'closed') {
			return { ok: false, error: this.__notReady() };
		}
		const result = await this.checker.check(options);
		if (result.ok) {
			if (this.current === 'failed' && this.instance) {
				this.__state({ state: this.__settled() });
			}
		} else if (this.current === 'ready') {
			this.__state({ state: 'failed', error: result.error });
		}
		return result;
	}

	/**
	 * The raw driver object — available once `connect()` has resolved,
	 * whatever the state. Throws `NOT_READY` only when there is none.
	 */
	getInstance(): Instance {
		if (!this.instance) throw this.__notReady();
		return this.instance;
	}

	// ── what a concrete link implements ──────────────────────────────────

	protected abstract __open(): Promise<Instance>;
	protected abstract __shut(options: { instance: Instance }): Promise<void>;
	protected abstract __ping(options: {
		instance: Instance;
	}): Promise<Result<unknown>>;

	/** State once opened. A Kafka consumer overrides: `connecting` until it joins its group. */
	protected __settled(): LinkState {
		return 'ready';
	}

	/** Extra connections to close / release with this link. Connectors override. */
	protected __extras(): Link<unknown>[] {
		return [];
	}

	/** The current epoch — capture it when opening, pass it to `__mark`. */
	protected __epoch(): number {
		return this.epoch;
	}

	/** A driver-reported state change. Ignored if it's from an older epoch or the link is closed. */
	protected __mark(options: {
		state: LinkState;
		epoch: number;
		error?: unknown;
	}): void {
		if (options.epoch !== this.epoch || this.current === 'closed') return;
		this.__state({ state: options.state, error: options.error });
	}

	protected __notReady(): LinkError {
		return new LinkError({
			code: 'NOT_READY',
			link: this.name,
			connector: this.connector,
			message: `${this.label}: not connected`,
		});
	}

	// ── internals ─────────────────────────────────────────────────────────

	private async __connect(): Promise<void> {
		const epoch = this.epoch;
		this.__state({ state: 'connecting' });
		let instance: Instance;
		try {
			instance = await this.__open();
		} catch (error) {
			if (epoch === this.epoch) this.__state({ state: 'failed', error });
			throw error;
		}
		if (epoch !== this.epoch) {
			await this.__shut({ instance }).catch((error) => {
				log.error(
					error,
					`${this.label}: shutting a superseded connection failed`,
				);
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
	private async __release(options: { error: unknown }): Promise<void> {
		await this.__drop({ extras: 'release', error: options.error });
		this.__state({ state: 'failed', error: options.error });
	}

	private async __drop(options: {
		extras: 'close' | 'release';
		error?: unknown;
	}): Promise<void> {
		this.epoch++;
		this.connection.reset();
		for (const extra of this.__extras()) {
			if (options.extras === 'close') await extra.close();
			else await extra.__release({ error: options.error });
		}
		const instance = this.instance;
		this.instance = null;
		if (instance) {
			await this.__shut({ instance }).catch((error) => {
				log.error(error, `${this.label}: shutting the connection failed`);
			});
		}
	}

	private __state(options: { state: LinkState; error?: unknown }): void {
		if (this.current === options.state) return;
		this.current = options.state;
		const event = { name: this.name };
		if (options.state === 'ready') {
			log.info(`${this.label}: ready`);
			this.__emit(() => this.on.connect?.(event));
		} else if (options.state === 'failed') {
			log.warn({ err: options.error }, `${this.label}: failed`);
			this.__emit(() => this.on.fail?.({ ...event, error: options.error }));
		} else if (options.state === 'closed') {
			log.info(`${this.label}: closed`);
			this.__emit(() => this.on.close?.(event));
		}
	}

	/** An owner's handler must never break the link — sync throw or async rejection. */
	private __emit(handler: () => unknown): void {
		try {
			Promise.resolve(handler()).catch((error) => {
				log.error(error, `${this.label}: event handler failed`);
			});
		} catch (error) {
			log.error(error, `${this.label}: event handler failed`);
		}
	}
}

/**
 * A link that opens extra connections. Holds their scope: closes them before
 * itself, releases them when its own breaker releases it.
 */
export abstract class Connector<Instance> extends Link<Instance> {
	protected readonly scope: Scope;
	protected readonly defaults: HealthOptions;

	constructor(init: LinkInit) {
		super(init);
		this.scope = new Scope({ connector: this.name });
		this.defaults = { ...init.health };
	}

	protected override __extras(): Link<unknown>[] {
		return this.scope.list();
	}

	/** What every extra connection of this connector is created with. */
	protected __child(options: LinkOptions): LinkInit {
		return {
			...options,
			connector: this.name,
			scope: this.scope,
			defaults: this.defaults,
		};
	}
}
