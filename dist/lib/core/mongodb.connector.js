// lib/core/mongodb.connector.ts
import { lazy } from '@rniverse/utils/lazy';
import { log } from '@rniverse/utils/logger';
import { HealthCheck } from '../tools/health.tool.js';
import { initMongoDB } from '../tools/mongodb.tool.js';
export class MongoDBConnector {
    db = null;
    client = null;
    config;
    connection = lazy(() => this.__connect());
    // Bumped by close(): a connect still in flight when close() runs sees the
    // change and discards its client instead of reviving a closed connector.
    epoch = 0;
    checker;
    constructor(config) {
        const { health, ...driver } = config;
        this.config = driver;
        this.checker = new HealthCheck({ name: 'MongoDB', target: this, health });
    }
    /**
     * Connect to MongoDB. Safe to call multiple times — subsequent calls
     * return the same promise. Must be awaited before using any operations.
     */
    async connect() {
        return this.connection.get();
    }
    async __connect() {
        const epoch = this.epoch;
        try {
            const { client, db } = await initMongoDB(this.config);
            if (epoch !== this.epoch) {
                await client.close().catch(() => { });
                throw new Error('MongoDB connection closed while connecting');
            }
            this.client = client;
            this.db = db;
            return db;
        }
        catch (error) {
            log.error(error, 'Failed to initialize MongoDB connector');
            throw error;
        }
    }
    require_db() {
        if (!this.db)
            throw new Error('MongoDB not connected — call connect() first');
        return this.db;
    }
    require_client() {
        if (!this.client)
            throw new Error('MongoDB not connected — call connect() first');
        return this.client;
    }
    async ping() {
        try {
            const db = this.require_db();
            const data = await db.admin().ping();
            return { ok: true, data };
        }
        catch (err) {
            log.error(err, 'MongoDB ping failed');
            return { ok: false, error: err };
        }
    }
    /**
     * Reconnect if needed, ping with a time limit and retries, and trip the
     * circuit after repeated failures — see `HealthCheck`. Never throws.
     * `{ trial: true }` checks now, skipping the rest of the circuit's cooldown.
     */
    async health(options = {}) {
        return this.checker.check(options);
    }
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit() {
        return this.checker.state;
    }
    /**
     * The health check's circuit breaker — for manual control (`open({ ms })`,
     * `reset()`) and read-only state (`failures`, `remaining`). Use
     * `health({ trial: true })` rather than `breaker.trial()` to test the
     * connection now: it reconnects and pings.
     */
    get breaker() {
        return this.checker.breaker;
    }
    getClientInstance() {
        return this.require_client();
    }
    getInstance() {
        return this.require_db();
    }
    getDB(name) {
        return this.require_client().db(name);
    }
    async close() {
        this.epoch++;
        this.connection.reset();
        if (this.client) {
            await this.client.close().catch((err) => {
                log.error(err, 'Error closing MongoDB connection');
            });
        }
        this.client = null;
        this.db = null;
        log.info('MongoDB connection closed');
    }
}
//# sourceMappingURL=mongodb.connector.js.map