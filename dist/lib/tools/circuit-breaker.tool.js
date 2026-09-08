// lib/tools/circuit-breaker.tool.ts
import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
/**
 * Per-connector health signal. When `threshold` consecutive health checks fail
 * the circuit "opens" and the connector closes its own connection to free
 * resources (pool, sockets, reconnect timers) — nothing else is touched. After
 * `cooldownMs` the state becomes `half-open`, meaning a fresh `connect()` is
 * worth trying. A passing check closes the circuit again.
 *
 * It never blocks a call itself; `state` is a signal a caller can poll.
 *
 * `new CircuitBreaker()` reads its config from the environment; pass options to
 * override.
 */
export class CircuitBreaker {
    failures = 0;
    openedAt = null;
    threshold;
    cooldownMs;
    constructor(options = {}) {
        this.threshold =
            options.threshold ??
                boundedParseInt(environment.get('CIRCUIT_THRESHOLD'), {
                    min: 1,
                    fallback: 1,
                });
        this.cooldownMs =
            options.cooldownMs ??
                boundedParseInt(environment.get('CIRCUIT_COOLDOWN_MS'), {
                    min: 0,
                    fallback: 30_000,
                });
    }
    get state() {
        if (this.openedAt === null)
            return 'closed';
        return Date.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
    }
    /** Record a health-check outcome. Returns `true` if this call opened the circuit. */
    record(ok) {
        if (ok) {
            this.reset();
            return false;
        }
        this.failures++;
        if (this.failures >= this.threshold && this.openedAt === null) {
            this.openedAt = Date.now();
            return true;
        }
        return false;
    }
    reset() {
        this.failures = 0;
        this.openedAt = null;
    }
}
//# sourceMappingURL=circuit-breaker.tool.js.map