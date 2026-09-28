// test/shared/leak.test.ts
//
// Regression canary for the failed-connect cleanup paths. Each probe does one
// failed connect() against an unreachable address and then does nothing; if the
// connector (or its driver) left a reconnect timer / heartbeat interval / open
// socket behind, the probe process hangs and this test times out.
//
// NOTE: with the pinned `postgres` and `mongodb` versions the drivers already
// self-clean on a rejected connect(), so today this passes with *or* without our
// `.end()` / `client.close()` calls in the catch blocks. Its value is forward:
// a future driver bump that reintroduces a leak flips this red.

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const FIXTURE = join(import.meta.dir, 'fixtures', 'leak-probe.ts');
const BUDGET_MS = 8000; // generous: the probes' own connect timeouts are ~2s

async function exitsWithin(driver: string, budgetMs: number): Promise<boolean> {
	const proc = Bun.spawn(['bun', FIXTURE, driver], {
		stdout: 'ignore',
		stderr: 'ignore',
	});
	const timer = new Promise<'timeout'>((r) =>
		setTimeout(() => r('timeout'), budgetMs),
	);
	const outcome = await Promise.race([proc.exited, timer]);
	if (outcome === 'timeout') {
		proc.kill();
		return false;
	}
	return true;
}

describe('failed connect() does not keep the process alive', () => {
	test('Postgres', async () => {
		expect(await exitsWithin('postgres', BUDGET_MS)).toBe(true);
	});

	test('Mongo', async () => {
		expect(await exitsWithin('mongo', BUDGET_MS)).toBe(true);
	});
});
