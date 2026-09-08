// lib/test/app-name.test.ts
// Unit tests for INSTANCE_NAME / appName wiring. No external services required.

import { afterEach, describe, expect, test } from 'bun:test';
import { initRedis } from '@tools';

const original = process.env.INSTANCE_NAME;

afterEach(() => {
	if (original === undefined) delete process.env.INSTANCE_NAME;
	else process.env.INSTANCE_NAME = original;
});

describe('redis clientName resolution', () => {
	test('explicit appName wins over everything', () => {
		process.env.INSTANCE_NAME = 'from-env';
		const cfg = initRedis({ url: 'redis://localhost:6379', appName: 'svc-a' });
		expect(cfg.clientName).toBe('svc-a');
	});

	test('falls back to INSTANCE_NAME', () => {
		process.env.INSTANCE_NAME = 'from-env';
		const cfg = initRedis({ url: 'redis://localhost:6379' });
		expect(cfg.clientName).toBe('from-env');
	});

	test('blank INSTANCE_NAME falls through to the default', () => {
		process.env.INSTANCE_NAME = '   ';
		const cfg = initRedis({ url: 'redis://localhost:6379' });
		expect(cfg.clientName).toBe('connectors');
	});

	test('defaults to "connectors" when nothing is set', () => {
		delete process.env.INSTANCE_NAME;
		const cfg = initRedis({ url: 'redis://localhost:6379' });
		expect(cfg.clientName).toBe('connectors');
	});
});
