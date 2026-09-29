// lib/shared/health.ts
import { log } from '@rniverse/utils/logger';
import { CircuitBreaker, retry, timeout, } from '@rniverse/utils/resilience';
import { setting } from './setting.js';
/** A ping that resolved `{ ok: false }` is as much a failure as one that threw. */
const failed = (result) => !result.ok || result.data.ok === false;
/**
 * One connector's health check: reconnect if needed, ping with a time limit,
 * retry a few times, and trip a circuit breaker after repeated failed checks.
 *
 * - While the circuit is open, `check()` fails immediately — no ping, no wait.
 * - Opening the circuit marks the link failed (`trip`) and destroys nothing:
 *   the driver keeps reconnecting underneath.
 * - After `cooldown`, the next check is the breaker's single trial — a plain
 *   ping on the same driver object (`connect()` only creates one if there's
 *   none yet).
 *
 * `check()` never throws — every failure comes back as `{ ok: false, error }`.
 */
export class HealthCheck {
    breaker;
    attempts;
    timeout;
    name;
    target;
    constructor(config) {
        const { name, target, health = {} } = config;
        this.name = name;
        this.target = target;
        this.attempts = setting({
            value: health.attempts,
            env: 'MAX_HEALTH_RETRIES',
            min: 1,
            fallback: 3,
        });
        this.timeout = setting({
            value: health.timeout,
            env: 'HEALTH_TIMEOUT_MS',
            min: 0,
            fallback: 2_000,
        });
        this.breaker = new CircuitBreaker({
            threshold: setting({
                value: health.threshold,
                env: 'CIRCUIT_THRESHOLD',
                min: 1,
                fallback: 3,
            }),
            cooldown: setting({
                value: health.cooldown,
                env: 'CIRCUIT_COOLDOWN_MS',
                min: 0,
                fallback: 30_000,
            }),
            trips: failed,
            on: {
                open: ({ failures }) => {
                    log.warn({ failures }, `${this.name} circuit open`);
                    this.target.trip({
                        error: new Error(`${this.name}: circuit open after ${failures} failed health checks`),
                    });
                },
                close: () => log.info(`${this.name} circuit closed — healthy again`),
            },
        });
    }
    get state() {
        return this.breaker.state;
    }
    /**
     * `{ trial: true }` runs this check as the breaker's trial now, skipping the
     * rest of the cooldown — ping immediately. Same single-trial
     * rules; while closed it's just a normal check.
     */
    async check(options = {}) {
        // The breaker wraps the whole check, retries included — `threshold`
        // counts failed *checks*, not failed pings. (`resilient` puts retry
        // outside the breaker, which would count every ping; wrong here.)
        let tries = 0;
        const attempt = () => {
            tries++;
            return timeout(async () => {
                await this.target.connect();
                return this.target.ping();
            }, this.timeout);
        };
        const guarded = options.trial
            ? this.breaker.trial.bind(this.breaker)
            : this.breaker.run.bind(this.breaker);
        try {
            const result = await guarded(() => retry(attempt, {
                attempts: this.attempts,
                retryable: failed,
                on: {
                    retry: ({ attempt, attempts }) => log.warn(`${this.name} health check failed, retrying... (${attempt}/${attempts})`),
                },
            }));
            // A retry was announced — say how it ended, even when the link's
            // state doesn't change (it would log nothing else).
            if (tries > 1) {
                if (result.ok) {
                    log.info(`${this.name} health check passed on attempt ${tries}/${this.attempts}`);
                }
                else {
                    log.warn(`${this.name} health check failed after ${tries} attempts`);
                }
            }
            return result;
        }
        catch (error) {
            return { ok: false, error };
        }
    }
}
//# sourceMappingURL=health.js.map