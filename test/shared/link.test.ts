// test/shared/link.test.ts

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { sleep } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import type { Result } from '@rniverse/utils/result';
import { LinkError } from '@shared/errors';
import { Connector, Link, type LinkInit } from '@shared/link';
import type {
	ConnectorOptions,
	LinkOptions,
	LinkState,
} from '@shared/shared.type';

type Driver = { id: number };
type Mode = 'ok' | 'fail-open' | 'fail-ping';

/** A link over a fake driver whose behaviour a test controls. */
class FakeLink extends Link<Driver> {
	opens = 0;
	pings = 0;
	shuts: number[] = [];
	mode: Mode = 'ok';
	gate: Promise<void> | null = null;

	protected async __open(): Promise<Driver> {
		this.opens++;
		const id = this.opens;
		if (this.gate) await this.gate;
		if (this.mode === 'fail-open') throw new Error('cannot open');
		return { id };
	}

	protected async __shut(options: { instance: Driver }): Promise<void> {
		this.shuts.push(options.instance.id);
	}

	protected async __ping(): Promise<Result<unknown>> {
		this.pings++;
		return this.mode === 'fail-ping'
			? { ok: false, error: new Error('ping failed') }
			: { ok: true };
	}

	/** Stand-in for a driver event. */
	event(options: { state: LinkState; epoch?: number }): void {
		this.__mark({
			state: options.state,
			epoch: options.epoch ?? this.__epoch(),
		});
	}

	epochNow(): number {
		return this.__epoch();
	}
}

/** A connector over the same fake driver, with declared fake extras. */
class FakeConnector extends Connector<Driver> {
	opens = 0;
	pings = 0;
	mode: Mode = 'ok';
	gate: Promise<void> | null = null;
	pingDelay = 0;
	inFlight = 0;
	maxInFlight = 0;

	constructor(options: ConnectorOptions & { extras?: LinkOptions[] }) {
		super(options);
		for (const extra of options.extras ?? []) {
			this.__adopt(new FakeLink(this.__child(extra) as LinkInit));
		}
	}

	protected async __open(): Promise<Driver> {
		this.opens++;
		if (this.gate) await this.gate;
		if (this.mode === 'fail-open') throw new Error('cannot open');
		return { id: this.opens };
	}
	protected async __shut(): Promise<void> {}
	protected async __ping(): Promise<Result<unknown>> {
		this.pings++;
		this.inFlight++;
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
		await sleep(this.pingDelay);
		this.inFlight--;
		return this.mode === 'fail-ping'
			? { ok: false, error: new Error('ping failed') }
			: { ok: true };
	}
	get extras() {
		return this.__of({ kind: FakeLink });
	}
}

const quick = { attempts: 1, timeout: 50, threshold: 1, cooldown: 30 };

/** Records every lifecycle event a link fires, in order. */
function record(link: Link<unknown>) {
	const events: string[] = [];
	for (const type of ['connect', 'recover', 'fail', 'close'] as const) {
		link.on(type, {
			name: 'recorder',
			handler: ({ name }) => {
				events.push(`${type}:${name}`);
			},
		});
	}
	return events;
}

describe('Link — lifecycle', () => {
	test('idle → ready on connect, one connect event, concurrent connects share one open', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		expect(link.state).toBe('idle');
		await Promise.all([link.connect(), link.connect(), link.connect()]);
		expect(link.opens).toBe(1);
		expect(link.state).toBe('ready');
		expect(events).toEqual(['connect:a']);
	});

	test('a failed open → failed + fail event; connect again retries with a fresh open', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		link.mode = 'fail-open';
		await expect(link.connect()).rejects.toThrow('cannot open');
		expect(link.state).toBe('failed');
		link.mode = 'ok';
		await link.connect();
		expect(link.opens).toBe(2);
		expect(events).toEqual(['fail:a', 'connect:a']);
	});

	test('connect() with a driver object already there is a no-op — the driver owns reconnecting', async () => {
		const link = new FakeLink({ name: 'a' });
		await link.connect();
		link.event({ state: 'failed' }); // e.g. kafkajs DISCONNECT
		await link.connect();
		expect(link.opens).toBe(1);
		expect(link.shuts).toEqual([]);
		expect(link.state).toBe('failed');
	});

	test('close → closed + close event, the driver is shut', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		await link.connect();
		await link.close();
		expect(link.state).toBe('closed');
		expect(link.shuts).toEqual([1]);
		expect(events).toEqual(['connect:a', 'close:a']);
	});

	test('a closed link reopens with a new driver object — connect fires again', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		await link.connect();
		await link.close();
		await link.connect();
		expect(link.state).toBe('ready');
		expect(link.opens).toBe(2);
		expect(events).toEqual(['connect:a', 'close:a', 'connect:a']);
	});

	test('close() during connect wins: the connect rejects, its connection is shut', async () => {
		const link = new FakeLink({ name: 'a' });
		let release: () => void = () => {};
		link.gate = new Promise((resolve) => {
			release = resolve;
		});
		const pending = link.connect();
		await link.close();
		release();
		await expect(pending).rejects.toBeInstanceOf(LinkError);
		expect(link.state).toBe('closed');
		expect(link.shuts).toEqual([1]);
		expect(() => link.getInstance()).toThrow(LinkError);
	});
});

describe('Link — listeners', () => {
	afterEach(() => {
		(log.error as unknown as { mockRestore?: () => void }).mockRestore?.();
	});

	test('run in registration order with the payload', async () => {
		const link = new FakeLink({ name: 'a' });
		const calls: string[] = [];
		link.on('connect', {
			name: 'first',
			handler: (event) => {
				calls.push(`first:${event.name}`);
			},
		});
		link.on('connect', {
			name: 'second',
			handler: (event) => {
				calls.push(`second:${event.name}`);
			},
		});
		await link.connect();
		expect(calls).toEqual(['first:a', 'second:a']);
	});

	test('a duplicate name for the same event throws DUPLICATE_NAME; another event is fine', () => {
		const link = new FakeLink({ name: 'a' });
		const handler = () => {};
		link.on('connect', { name: 'x', handler });
		let error: LinkError | undefined;
		try {
			link.on('connect', { name: 'x', handler });
		} catch (e) {
			error = e as LinkError;
		}
		expect(error).toBeInstanceOf(LinkError);
		expect(error?.code).toBe('DUPLICATE_NAME');
		expect(() => link.on('fail', { name: 'x', handler })).not.toThrow();
	});

	test('off() removes a listener by name, freeing the name', async () => {
		const link = new FakeLink({ name: 'a' });
		let calls = 0;
		const handler = () => {
			calls++;
		};
		link.on('connect', { name: 'x', handler });
		link.off('connect', { name: 'x' });
		link.on('connect', { name: 'x', handler }); // name free again
		link.off('connect', { name: 'x' });
		await link.connect();
		expect(calls).toBe(0);
	});

	test('a throwing or rejecting listener is logged by name and never stops the rest', async () => {
		const error = spyOn(log, 'error');
		const link = new FakeLink({ name: 'a' });
		let reached = false;
		link.on('connect', {
			name: 'throws',
			handler: () => {
				throw new Error('handler bug');
			},
		});
		link.on('connect', {
			name: 'rejects',
			handler: async () => {
				throw new Error('async bug');
			},
		});
		link.on('connect', {
			name: 'last',
			handler: () => {
				reached = true;
			},
		});
		await link.connect();
		await sleep(1);
		expect(link.state).toBe('ready');
		expect(reached).toBe(true);
		const lines = error.mock.calls.map((call) => String(call[1]));
		expect(lines).toContain("a: listener 'throws' (connect) failed");
		expect(lines).toContain("a: listener 'rejects' (connect) failed");
	});

	test("on('connect') on a link that's already ready runs the handler once, right away", async () => {
		const link = new FakeLink({ name: 'a' });
		await link.connect();
		let connects = 0;
		let fails = 0;
		link.on('connect', {
			name: 'late',
			handler: () => {
				connects++;
			},
		});
		link.on('fail', {
			name: 'late',
			handler: () => {
				fails++;
			},
		});
		expect(connects).toBe(1);
		expect(fails).toBe(0);
	});
});

describe('Link — connect vs recover', () => {
	test('back to ready on the same driver object fires recover, not connect', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		await link.connect();
		link.event({ state: 'failed' });
		link.event({ state: 'ready' });
		expect(events).toEqual(['connect:a', 'fail:a', 'recover:a']);
	});

	test('driver events move the state; stale ones (older epoch) are ignored', async () => {
		const link = new FakeLink({ name: 'a' });
		const events = record(link);
		await link.connect();
		const epoch = link.epochNow();
		await link.close();
		await link.connect();
		link.event({ state: 'failed', epoch }); // from the old connection
		expect(link.state).toBe('ready');
		expect(events).toEqual(['connect:a', 'close:a', 'connect:a']);
	});
});

describe('Link — getInstance', () => {
	test('throws NOT_READY before connect and after close; works while failed', async () => {
		const link = new FakeLink({ name: 'a' });
		const before = (() => {
			try {
				link.getInstance();
			} catch (error) {
				return error;
			}
		})() as LinkError;
		expect(before).toBeInstanceOf(LinkError);
		expect(before.code).toBe('NOT_READY');
		expect(before.link).toBe('a');
		await link.connect();
		link.event({ state: 'failed' });
		expect(link.getInstance()).toEqual({ id: 1 });
		await link.close();
		expect(() => link.getInstance()).toThrow(LinkError);
	});
});

describe('Link — health and circuit breaker', () => {
	test('a failed check → failed + fail; a passing one → ready + recover', async () => {
		const link = new FakeLink({
			name: 'a',
			health: { ...quick, threshold: 5 },
		});
		const events = record(link);
		await link.connect();
		link.mode = 'fail-ping';
		expect((await link.health()).ok).toBe(false);
		expect(link.state).toBe('failed');
		link.mode = 'ok';
		expect((await link.health()).ok).toBe(true);
		expect(link.state).toBe('ready');
		expect(events).toEqual(['connect:a', 'fail:a', 'recover:a']);
	});

	test('health() makes the first connect when there is no driver object', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		expect((await link.health()).ok).toBe(true);
		expect(link.opens).toBe(1);
		expect(link.state).toBe('ready');
	});

	test('the circuit opening keeps the driver object: failed, nothing shut', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		await link.connect();
		link.mode = 'fail-ping';
		await link.health();
		expect(link.circuit).toBe('open');
		expect(link.state).toBe('failed');
		expect(link.shuts).toEqual([]);
		expect(link.getInstance()).toEqual({ id: 1 });
	});

	test('after the cooldown the trial pings the same object and the link recovers', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		const events = record(link);
		await link.connect();
		link.mode = 'fail-ping';
		await link.health();
		link.mode = 'ok';
		await sleep(40);
		expect((await link.health()).ok).toBe(true);
		expect(link.state).toBe('ready');
		expect(link.opens).toBe(1);
		expect(link.circuit).toBe('closed');
		expect(events.at(-1)).toBe('recover:a');
	});

	test('health({ trial: true }) recovers now, without waiting out the cooldown', async () => {
		const link = new FakeLink({
			name: 'a',
			health: { ...quick, cooldown: 60_000 },
		});
		await link.connect();
		link.mode = 'fail-ping';
		await link.health();
		link.mode = 'ok';
		expect((await link.health()).ok).toBe(false); // still cooling down
		expect((await link.health({ trial: true })).ok).toBe(true);
		expect(link.state).toBe('ready');
	});

	test('breaker.open({ ms }) marks it failed right away; reset() + health() brings it back', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		await link.connect();
		link.breaker.open({ ms: 60_000 });
		expect(link.state).toBe('failed');
		expect(link.shuts).toEqual([]);
		expect((await link.health()).ok).toBe(false);
		link.breaker.reset();
		expect((await link.health()).ok).toBe(true);
		expect(link.state).toBe('ready');
	});

	test('health() on a closed link fails without reconnecting', async () => {
		const link = new FakeLink({ name: 'a' });
		await link.connect();
		await link.close();
		const result = await link.health();
		expect(result.ok).toBe(false);
		expect(link.opens).toBe(1);
	});

	test('ping() never throws, NOT_READY before connect', async () => {
		const result = await new FakeLink({ name: 'a' }).ping();
		expect(result.ok).toBe(false);
		expect(!result.ok && (result.error as LinkError).code).toBe('NOT_READY');
	});
});

describe('Connector — declared extras', () => {
	const connectors: FakeConnector[] = [];
	afterEach(async () => {
		for (const c of connectors.splice(0)) await c.close();
		(log.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
	});
	const make = (
		options: Partial<ConnectorOptions> & { extras?: LinkOptions[] } = {},
	) => {
		const c = new FakeConnector({ name: 'main', ...options });
		connectors.push(c);
		return c;
	};

	test('duplicate names in the config throw DUPLICATE_NAME', () => {
		let error: LinkError | undefined;
		try {
			make({ extras: [{ name: 'x' }, { name: 'x' }] });
		} catch (e) {
			error = e as LinkError;
		}
		expect(error).toBeInstanceOf(LinkError);
		expect(error?.code).toBe('DUPLICATE_NAME');
		expect(error?.connector).toBe('main');
	});

	test('lookups: get() returns the link or throws UNKNOWN_NAME; has / size / iteration', () => {
		const c = make({ extras: [{ name: 'a' }, { name: 'b' }] });
		expect(c.extras.get('a').name).toBe('a');
		expect(c.extras.get('a').connector).toBe('main');
		expect(c.extras.has('b')).toBe(true);
		expect(c.extras.size).toBe(2);
		expect([...c.extras].map((link) => link.name)).toEqual(['a', 'b']);
		let error: LinkError | undefined;
		try {
			c.extras.get('nope');
		} catch (e) {
			error = e as LinkError;
		}
		expect(error?.code).toBe('UNKNOWN_NAME');
		expect(error?.link).toBe('nope');
	});

	test('extras connect when their connector does — connect fires on each', async () => {
		const c = make({ extras: [{ name: 'a' }] });
		const a = c.extras.get('a');
		const events = record(a);
		await c.connect();
		await a.connect(); // joins the connect the connector started
		expect(a.state).toBe('ready');
		expect(a.opens).toBe(1);
		expect(events).toEqual(['connect:a']);
	});

	test("an extra's connect() before its connector is ready warns and returns — no open, no throw", async () => {
		const warn = spyOn(log, 'warn');
		const c = make({ extras: [{ name: 'a' }] });
		const a = c.extras.get('a');
		await a.connect();
		expect(a.state).toBe('idle');
		expect(a.opens).toBe(0);
		expect(warn.mock.calls.map((call) => String(call[0]))).toContain(
			'main/a: waiting — main is idle',
		);
		await c.connect(); // the connector connects it once ready
		await a.connect();
		expect(a.state).toBe('ready');
	});

	test('health() passing connects an extra whose first connect failed', async () => {
		const c = make({ extras: [{ name: 'a' }], health: quick });
		const a = c.extras.get('a');
		a.mode = 'fail-open';
		await c.connect();
		await sleep(1); // the connector's connect of it fails
		expect(a.state).toBe('failed');
		expect(a.opens).toBe(1);
		a.mode = 'ok';
		expect((await c.health()).ok).toBe(true);
		await sleep(1);
		expect(a.state).toBe('ready');
		expect(a.opens).toBe(2);
	});

	test('a closed extra stays closed when its connector connects or passes health', async () => {
		const c = make({ extras: [{ name: 'a' }], health: quick });
		const a = c.extras.get('a');
		await a.close();
		await c.connect();
		await c.health();
		await sleep(1);
		expect(a.state).toBe('closed');
		expect(a.opens).toBe(0);
	});

	test("the connector failing takes its extras' state down — objects kept — and back up with recover", async () => {
		const c = make({ extras: [{ name: 'a' }], health: quick });
		const a = c.extras.get('a');
		await c.connect();
		await a.connect();
		const events = record(a);
		c.breaker.open({ ms: 60_000 });
		expect(c.state).toBe('failed');
		expect(a.state).toBe('failed');
		expect(a.getInstance()).toEqual({ id: 1 });
		expect(a.shuts).toEqual([]);

		c.breaker.reset();
		await c.health();
		expect(c.state).toBe('ready');
		expect(a.state).toBe('ready');
		expect(a.opens).toBe(1);
		expect(events).toEqual(['connect:a', 'fail:a', 'recover:a']);
	});

	test("an extra's own driver report wins over what its connector restores", async () => {
		const c = make({ extras: [{ name: 'a' }], health: quick });
		const a = c.extras.get('a');
		await c.connect();
		await a.connect();
		c.breaker.open({ ms: 60_000 });
		a.event({ state: 'failed' }); // its driver gave up meanwhile
		c.breaker.reset();
		await c.health();
		expect(a.state).toBe('failed');
	});

	test('connector close() closes its extras first', async () => {
		const c = make({ extras: [{ name: 'a' }] });
		const a = c.extras.get('a');
		await c.connect();
		await a.connect();
		await c.close();
		expect(a.state).toBe('closed');
		expect(a.shuts).toEqual([1]);
		expect(c.state).toBe('closed');
	});

	test('extras inherit the connector health settings unless given their own', async () => {
		const c = make({
			health: { ...quick, threshold: 1 },
			extras: [{ name: 'inherits' }, { name: 'own', health: { threshold: 5 } }],
		});
		const inherits = c.extras.get('inherits');
		const own = c.extras.get('own');
		await c.connect();
		await inherits.connect();
		await own.connect();
		inherits.mode = 'fail-ping';
		own.mode = 'fail-ping';
		await inherits.health();
		await own.health();
		expect(inherits.circuit).toBe('open');
		expect(own.circuit).toBe('closed');
	});
});

describe('Connector — recover timer', () => {
	const connectors: FakeConnector[] = [];
	afterEach(async () => {
		for (const c of connectors.splice(0)) await c.close();
	});
	const make = (options: Partial<ConnectorOptions> = {}) => {
		const c = new FakeConnector({ name: 'main', health: quick, ...options });
		connectors.push(c);
		return c;
	};

	test('off by default: nothing re-checks on its own', async () => {
		const c = make();
		await c.connect();
		await sleep(60);
		expect(c.pings).toBe(0);
	});

	test('connects a connector whose first connect failed, once the dependency is back', async () => {
		const c = make({ recover: { every: 10 } });
		c.mode = 'fail-open';
		await c.connect().catch(() => {});
		expect(c.state).toBe('failed');
		c.mode = 'ok';
		await sleep(50);
		expect(c.state).toBe('ready');
	});

	test('with a driver object, each pass is a health check', async () => {
		const c = make({ recover: { every: 10 } });
		await c.connect();
		await sleep(50);
		expect(c.pings).toBeGreaterThan(1);
	});

	test('passes never overlap', async () => {
		const c = make({
			recover: { every: 5 },
			health: { ...quick, timeout: 1_000 },
		});
		await c.connect();
		c.pingDelay = 30; // each pass outlasts several intervals
		await sleep(100);
		expect(c.pings).toBeGreaterThan(1);
		expect(c.maxInFlight).toBe(1);
	});

	test('stops on close()', async () => {
		const c = make({ recover: { every: 10 } });
		await c.connect();
		await c.close();
		const pings = c.pings;
		await sleep(40);
		expect(c.pings).toBe(pings);
	});
});
