// test/shared/health.test.ts

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { sleep } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import { CircuitOpenError, TimeoutError } from '@rniverse/utils/resilience';
import type { Result } from '@rniverse/utils/result';
import { HealthCheck } from '@shared/health';

/** A stand-in connector whose ping behaviour a test controls. */
function fakeTarget() {
	const target = {
		mode: 'ok' as 'ok' | 'fail' | 'hang' | 'throw',
		connects: 0,
		pings: 0,
		trips: 0,
		async connect() {
			target.connects++;
		},
		async ping(): Promise<Result<void>> {
			target.pings++;
			if (target.mode === 'hang') return new Promise(() => {});
			if (target.mode === 'throw') throw new Error('socket closed');
			if (target.mode === 'fail')
				return { ok: false, error: new Error('down') };
			return { ok: true };
		},
		trip() {
			target.trips++;
		},
	};
	return target;
}

const quick = { attempts: 1, timeout: 50, threshold: 2, cooldown: 60_000 };

describe('HealthCheck', () => {
	test('a healthy target: reconnect step then ping, ok result', async () => {
		const target = fakeTarget();
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		expect(await health.check()).toEqual({ ok: true });
		expect(target.connects).toBe(1);
		expect(target.pings).toBe(1);
		expect(health.state).toBe('closed');
	});

	test('a hung ping is cut off by the attempt timeout', async () => {
		const target = fakeTarget();
		target.mode = 'hang';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, timeout: 30 },
		});
		const started = Date.now();
		const result = await health.check();
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toBeInstanceOf(TimeoutError);
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	test('retries up to attempts within one check', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, attempts: 3 },
		});
		await health.check();
		expect(target.pings).toBe(3);
	});

	test('threshold counts failed checks, not failed pings', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: {
				...quick,
				attempts: 3,
				threshold: 2,
			},
		});
		await health.check(); // 3 failed pings, 1 failed check
		expect(health.state).toBe('closed');
		await health.check(); // 2nd failed check
		expect(health.state).toBe('open');
	});

	test('a returned { ok: false } and a thrown error both count', async () => {
		const target = fakeTarget();
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		target.mode = 'fail';
		await health.check();
		target.mode = 'throw';
		const result = await health.check();
		expect(result.ok).toBe(false);
		expect(health.state).toBe('open');
	});

	test('opening the circuit trips the target once — nothing is released', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		await health.check();
		expect(target.trips).toBe(0);
		await health.check();
		expect(target.trips).toBe(1);
	});

	test('while open, check() fails fast without pinging', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		await health.check();
		await health.check();
		const pings = target.pings;
		const result = await health.check();
		expect(!result.ok && result.error).toBeInstanceOf(CircuitOpenError);
		expect(target.pings).toBe(pings);
	});

	test('after cooldown, the trial check pings again and closes the circuit', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, cooldown: 30 },
		});
		await health.check();
		await health.check();
		expect(health.state).toBe('open');

		target.mode = 'ok'; // dependency came back
		await sleep(40);
		const connects = target.connects;
		expect(await health.check()).toEqual({ ok: true });
		expect(target.connects).toBe(connects + 1);
		expect(health.state).toBe('closed');
	});

	test('options fall back to env vars, then defaults', async () => {
		const saved = process.env.CIRCUIT_THRESHOLD;
		process.env.CIRCUIT_THRESHOLD = '1';
		try {
			const target = fakeTarget();
			target.mode = 'fail';
			const health = new HealthCheck({
				name: 'Fake',
				target,
				health: {
					attempts: 1,
					timeout: 50,
				},
			});
			await health.check();
			expect(health.state).toBe('open'); // threshold 1 from env
		} finally {
			if (saved === undefined) delete process.env.CIRCUIT_THRESHOLD;
			else process.env.CIRCUIT_THRESHOLD = saved;
		}
	});

	test('check() never throws', async () => {
		const target = fakeTarget();
		target.connect = async () => {
			throw new Error('cannot connect');
		};
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		const result = await health.check();
		expect(result.ok).toBe(false);
	});
});

describe('HealthCheck — manual trial', () => {
	test('check({ trial: true }) pings now, closing an open circuit', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, cooldown: 60_000 },
		});
		await health.check();
		await health.check();
		expect(health.state).toBe('open');

		target.mode = 'ok';
		const refused = await health.check(); // automatic: still cooling down
		expect(!refused.ok && refused.error).toBeInstanceOf(CircuitOpenError);

		const connects = target.connects;
		expect(await health.check({ trial: true })).toEqual({ ok: true });
		expect(target.connects).toBe(connects + 1);
		expect(health.state).toBe('closed');
	});

	test('a failed manual trial reopens the circuit and trips again', async () => {
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({ name: 'Fake', target, health: quick });
		await health.check();
		await health.check();
		const trips = target.trips;
		const result = await health.check({ trial: true });
		expect(result.ok).toBe(false);
		expect(health.state).toBe('open');
		expect(target.trips).toBe(trips + 1);
	});
});

describe('HealthCheck — how a retried check ended', () => {
	afterEach(() => {
		(log.info as unknown as { mockRestore?: () => void }).mockRestore?.();
		(log.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
	});

	test('logs the attempt a retried check passed on', async () => {
		const info = spyOn(log, 'info');
		const target = fakeTarget();
		let calls = 0;
		const ping = target.ping;
		target.ping = async () => {
			calls++;
			if (calls === 1) return { ok: false, error: new Error('slow') };
			return ping();
		};
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, attempts: 3 },
		});
		expect((await health.check()).ok).toBe(true);
		expect(info.mock.calls.map((call) => String(call[0]))).toContain(
			'Fake health check passed on attempt 2/3',
		);
	});

	test('logs a retried check that ran out of attempts', async () => {
		const warn = spyOn(log, 'warn');
		const target = fakeTarget();
		target.mode = 'fail';
		const health = new HealthCheck({
			name: 'Fake',
			target,
			health: { ...quick, attempts: 2, threshold: 5 },
		});
		await health.check();
		expect(warn.mock.calls.map((call) => String(call[0]))).toContain(
			'Fake health check failed after 2 attempts',
		);
	});

	test('a first-try pass logs nothing extra', async () => {
		const info = spyOn(log, 'info');
		const health = new HealthCheck({
			name: 'Fake',
			target: fakeTarget(),
			health: quick,
		});
		await health.check();
		expect(
			info.mock.calls.some((call) => String(call[0]).includes('passed on')),
		).toBe(false);
	});
});
