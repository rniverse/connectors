// test/shared/setting.test.ts

import { describe, expect, test } from 'bun:test';
import { LinkError } from '@shared/errors';
import { appName, setting } from '@shared/setting';

function withEnv(name: string, value: string | undefined, fn: () => void) {
	const saved = process.env[name];
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
	try {
		fn();
	} finally {
		if (saved === undefined) delete process.env[name];
		else process.env[name] = saved;
	}
}

describe('setting', () => {
	test('explicit option wins, then env var, then default', () => {
		withEnv('X_TEST_SETTING', '7', () => {
			expect(
				setting({ value: 3, env: 'X_TEST_SETTING', min: 0, fallback: 1 }),
			).toBe(3);
			expect(
				setting({
					value: undefined,
					env: 'X_TEST_SETTING',
					min: 0,
					fallback: 1,
				}),
			).toBe(7);
		});
		withEnv('X_TEST_SETTING', undefined, () => {
			expect(
				setting({
					value: undefined,
					env: 'X_TEST_SETTING',
					min: 0,
					fallback: 1,
				}),
			).toBe(1);
		});
	});
});

describe('appName', () => {
	test('config wins, then INSTANCE_NAME', () => {
		withEnv('INSTANCE_NAME', 'from-env', () => {
			expect(appName({ value: 'from-config', connector: 'pg' })).toBe(
				'from-config',
			);
			expect(appName({ value: undefined, connector: 'pg' })).toBe('from-env');
		});
	});

	test('neither set → MISSING_APP_NAME, no default', () => {
		withEnv('INSTANCE_NAME', undefined, () => {
			let error: LinkError | undefined;
			try {
				appName({ value: undefined, connector: 'pg' });
			} catch (e) {
				error = e as LinkError;
			}
			expect(error).toBeInstanceOf(LinkError);
			expect(error?.code).toBe('MISSING_APP_NAME');
		});
	});
});
