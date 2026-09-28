// lib/shared/shared.type.ts

import type { Result } from '@rniverse/utils/result';

/**
 * Where a link is in its life.
 *
 * - `idle` — created, never connected
 * - `connecting` — connect in progress, or reconnecting
 * - `ready` — connected and able to do its job
 * - `failed` — connect or health check failed, the driver reported a crash, or
 *   a breaker released the connection
 * - `closed` — the owner called `close()` (never the breaker's doing)
 */
export type LinkState = 'idle' | 'connecting' | 'ready' | 'failed' | 'closed';

/** What an owner hears. Every breaker change also shows up as one of these. */
export type LinkEvents = {
	/** → `ready`, the first time or again after a failure. */
	connect?: (event: { name: string }) => void;
	/** → `failed`. */
	fail?: (event: { name: string; error: unknown }) => void;
	/** → `closed` (the owner's close). */
	close?: (event: { name: string }) => void;
};

/**
 * Health-check and circuit-breaker settings. Each falls back to its env var,
 * then the default.
 */
export type HealthOptions = {
	/** Pings per health check, including the first. Env `MAX_HEALTH_RETRIES`, default 3. */
	attempts?: number;
	/** ms each ping (incl. a reconnect) may take. Env `HEALTH_TIMEOUT_MS`, default 2000. */
	timeout?: number;
	/** Consecutive failed checks that open the circuit. Env `CIRCUIT_THRESHOLD`, default 3. */
	threshold?: number;
	/** ms the circuit stays open before one trial check. Env `CIRCUIT_COOLDOWN_MS`, default 30000. */
	cooldown?: number;
};

/** Options every link takes. */
export type LinkOptions = {
	/** Required. Unique within its connector. */
	name: string;
	/** Extra connections default to their connector's settings. */
	health?: HealthOptions;
	on?: LinkEvents;
};

export type HealthCheckOptions = {
	/**
	 * Run this check as the circuit breaker's trial now, instead of waiting out
	 * the rest of the cooldown. Default false.
	 */
	trial?: boolean;
};

/** What `HealthCheck` drives. */
export type HealthTarget<T> = {
	connect(): Promise<unknown>;
	ping(): Promise<Result<T>>;
	/** Drop the connection because the circuit opened (not the owner's close). */
	release(options: { error: unknown }): Promise<void>;
};

export type HealthCheckConfig<T> = {
	/** Shown in log lines. */
	name: string;
	target: HealthTarget<T>;
	health?: HealthOptions;
};

export type LinkErrorCode = 'DUPLICATE_NAME' | 'NOT_READY' | 'MISSING_APP_NAME';
