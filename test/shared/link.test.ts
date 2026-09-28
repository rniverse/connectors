// test/shared/link.test.ts

import { afterEach, describe, expect, test } from 'bun:test';
import { sleep } from '@rniverse/utils/generic';
import type { Result } from '@rniverse/utils/result';
import { LinkError } from '@shared/errors';
import { Connector, Link } from '@shared/link';
import type { LinkOptions, LinkState } from '@shared/shared.type';

type Driver = { id: number };

/** A link over a fake driver whose behaviour a test controls. */
class FakeLink extends Link<Driver> {
	opens = 0;
	shuts: number[] = [];
	mode: 'ok' | 'fail-open' | 'fail-ping' = 'ok';
	gate: Promise<void> | null = null;
	settled: LinkState = 'ready';

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
		return this.mode === 'fail-ping'
			? { ok: false, error: new Error('ping failed') }
			: { ok: true };
	}

	protected override __settled(): LinkState {
		return this.settled;
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

class FakeConnector extends Connector<Driver> {
	protected async __open(): Promise<Driver> {
		return { id: 0 };
	}
	protected async __shut(): Promise<void> {}
	protected async __ping(): Promise<Result<unknown>> {
		return { ok: true };
	}
	extra(options: LinkOptions): FakeLink {
		return new FakeLink(this.__child(options));
	}
	get extras(): ReadonlyMap<string, FakeLink> {
		return this.scope.of({ kind: FakeLink });
	}
}

const quick = { attempts: 1, timeout: 50, threshold: 1, cooldown: 30 };

/** Records every event a link fires, in order. */
function recorder() {
	const events: string[] = [];
	return {
		events,
		on: {
			connect: ({ name }: { name: string }) => events.push(`connect:${name}`),
			fail: ({ name }: { name: string }) => events.push(`fail:${name}`),
			close: ({ name }: { name: string }) => events.push(`close:${name}`),
		},
	};
}

describe('Link — lifecycle', () => {
	test('idle → ready on connect, one connect event, concurrent connects share one open', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({ name: 'a', on });
		expect(link.state).toBe('idle');
		await Promise.all([link.connect(), link.connect(), link.connect()]);
		expect(link.opens).toBe(1);
		expect(link.state).toBe('ready');
		expect(events).toEqual(['connect:a']);
	});

	test('a failed open → failed + fail event; connect again retries with a fresh open', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({ name: 'a', on });
		link.mode = 'fail-open';
		await expect(link.connect()).rejects.toThrow('cannot open');
		expect(link.state).toBe('failed');
		link.mode = 'ok';
		await link.connect();
		expect(link.opens).toBe(2);
		expect(events).toEqual(['fail:a', 'connect:a']);
	});

	test('close → closed + close event, the driver is shut', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({ name: 'a', on });
		await link.connect();
		await link.close();
		expect(link.state).toBe('closed');
		expect(link.shuts).toEqual([1]);
		expect(events).toEqual(['connect:a', 'close:a']);
	});

	test('a closed link can connect again', async () => {
		const link = new FakeLink({ name: 'a' });
		await link.connect();
		await link.close();
		await link.connect();
		expect(link.state).toBe('ready');
		expect(link.opens).toBe(2);
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

	test('an event handler that throws does not break the link', async () => {
		const link = new FakeLink({
			name: 'a',
			on: {
				connect: () => {
					throw new Error('handler bug');
				},
			},
		});
		await link.connect();
		expect(link.state).toBe('ready');
	});
});

describe('Link — getInstance vs state', () => {
	test('throws NOT_READY before connect and after close', async () => {
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
		expect(link.getInstance()).toEqual({ id: 1 });
		await link.close();
		expect(() => link.getInstance()).toThrow(LinkError);
	});

	test('works while not ready — a link that settles in `connecting`', async () => {
		const link = new FakeLink({ name: 'consumer' });
		link.settled = 'connecting';
		await link.connect();
		expect(link.state).toBe('connecting');
		expect(link.getInstance()).toEqual({ id: 1 });
	});

	test('driver events move the state; stale ones (older epoch) are ignored', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({ name: 'a', on });
		link.settled = 'connecting';
		await link.connect();
		const epoch = link.epochNow();
		link.event({ state: 'ready' });
		expect(link.state).toBe('ready');
		await link.close();
		await link.connect();
		link.event({ state: 'failed', epoch }); // from the old connection
		expect(link.state).toBe('connecting');
		expect(events).toEqual(['connect:a', 'close:a']);
	});
});

describe('Link — health, breaker, manual control', () => {
	test('a failed check → failed + fail; a passing one → ready + connect', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({
			name: 'a',
			on,
			health: { ...quick, threshold: 5 },
		});
		await link.connect();
		link.mode = 'fail-ping';
		expect((await link.health()).ok).toBe(false);
		expect(link.state).toBe('failed');
		link.mode = 'ok';
		expect((await link.health()).ok).toBe(true);
		expect(link.state).toBe('ready');
		expect(events).toEqual(['connect:a', 'fail:a', 'connect:a']);
	});

	test('the breaker opening releases the connection: failed, not closed', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		await link.connect();
		link.mode = 'fail-ping';
		await link.health();
		expect(link.circuit).toBe('open');
		expect(link.state).toBe('failed');
		expect(link.shuts).toEqual([1]);
		expect(() => link.getInstance()).toThrow(LinkError);
	});

	test('after the cooldown the trial reconnects and the link recovers', async () => {
		const { events, on } = recorder();
		const link = new FakeLink({ name: 'a', on, health: quick });
		await link.connect();
		link.mode = 'fail-ping';
		await link.health();
		link.mode = 'ok';
		await sleep(40);
		expect((await link.health()).ok).toBe(true);
		expect(link.state).toBe('ready');
		expect(link.opens).toBe(2);
		expect(link.circuit).toBe('closed');
		expect(events.at(-1)).toBe('connect:a');
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

	test('breaker.open({ ms }) takes it out of service; reset() + health() brings it back', async () => {
		const link = new FakeLink({ name: 'a', health: quick });
		await link.connect();
		link.breaker.open({ ms: 60_000 });
		await sleep(5); // the release runs on the open hook
		expect(link.state).toBe('failed');
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

describe('Connector — extra connections', () => {
	const connectors: FakeConnector[] = [];
	afterEach(async () => {
		for (const c of connectors.splice(0)) await c.close();
	});
	const make = (options: Partial<LinkOptions> = {}) => {
		const c = new FakeConnector({ name: 'main', ...options });
		connectors.push(c);
		return c;
	};

	test('duplicate names throw DUPLICATE_NAME', () => {
		const c = make();
		c.extra({ name: 'x' });
		let error: LinkError | undefined;
		try {
			c.extra({ name: 'x' });
		} catch (e) {
			error = e as LinkError;
		}
		expect(error).toBeInstanceOf(LinkError);
		expect(error?.code).toBe('DUPLICATE_NAME');
		expect(error?.connector).toBe('main');
	});

	test('a closed extra frees its name; a failed one keeps it', async () => {
		const c = make();
		const failing = c.extra({ name: 'failing' });
		failing.mode = 'fail-open';
		await failing.connect().catch(() => {});
		expect(() => c.extra({ name: 'failing' })).toThrow(LinkError);

		const done = c.extra({ name: 'done' });
		await done.close();
		expect(c.extras.has('done')).toBe(false);
		expect(() => c.extra({ name: 'done' })).not.toThrow();
	});

	test('reconnecting a closed extra reclaims its name — or throws if taken', async () => {
		const c = make();
		const first = c.extra({ name: 'x' });
		await first.close();
		c.extra({ name: 'x' }); // name reused while first is closed
		await expect(first.connect()).rejects.toBeInstanceOf(LinkError);
	});

	test('connector close() closes its extras first', async () => {
		const c = make();
		const a = c.extra({ name: 'a' });
		await c.connect();
		await a.connect();
		await c.close();
		expect(a.state).toBe('closed');
		expect(c.state).toBe('closed');
	});

	test("the connector's breaker releasing it fails its extras (names kept) — they reconnect on their own connect()", async () => {
		const c = make({ health: { ...quick, cooldown: 60_000 } });
		const a = c.extra({ name: 'a' });
		await c.connect();
		await a.connect();
		c.breaker.open({ ms: 60_000 });
		await sleep(5);
		expect(c.state).toBe('failed');
		expect(a.state).toBe('failed');
		expect(a.shuts).toEqual([1]);
		expect(c.extras.has('a')).toBe(true);

		c.breaker.reset();
		await c.connect();
		await a.connect(); // the owner's usual way back
		expect(a.state).toBe('ready');
	});

	test('extras inherit the connector health settings unless given their own', async () => {
		const c = make({ health: { ...quick, threshold: 1 } });
		const inherits = c.extra({ name: 'inherits' });
		const own = c.extra({ name: 'own', health: { threshold: 5 } });
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

describe('Link — connect() after a driver-reported failure', () => {
	test('drops the old driver object and opens a fresh one', async () => {
		const link = new FakeLink({ name: 'a' });
		await link.connect();
		link.event({ state: 'failed' }); // e.g. kafkajs DISCONNECT
		expect(link.state).toBe('failed');
		await Promise.all([link.connect(), link.connect()]);
		expect(link.state).toBe('ready');
		expect(link.opens).toBe(2); // one fresh open, not two
		expect(link.shuts).toEqual([1]);
		expect(link.getInstance()).toEqual({ id: 2 });
	});

	test('a health check does not throw away the driver object', async () => {
		const link = new FakeLink({
			name: 'a',
			health: { attempts: 1, threshold: 5, timeout: 50 },
		});
		await link.connect();
		link.event({ state: 'failed' });
		await link.health();
		expect(link.opens).toBe(1);
		expect(link.shuts).toEqual([]);
	});
});
