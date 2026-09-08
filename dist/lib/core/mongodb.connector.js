// lib/core/mongodb.connector.ts
import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { log } from '@rniverse/utils/logger';
import { retry } from '@rniverse/utils/retry';
import { CircuitBreaker } from '../tools/circuit-breaker.tool.js';
import { initMongoDB } from '../tools/mongodb.tool.js';
export class MongoDBConnector {
    db = null;
    client = null;
    config;
    init_promise = null;
    breaker = new CircuitBreaker();
    constructor(config) {
        this.config = config;
    }
    /**
     * Connect to MongoDB. Safe to call multiple times — subsequent calls
     * return the same promise. Must be awaited before using any operations.
     */
    async connect() {
        if (!this.init_promise) {
            this.init_promise = this.__connect();
        }
        return this.init_promise;
    }
    async __connect() {
        try {
            const { client, db } = await initMongoDB(this.config);
            this.client = client;
            this.db = db;
            this.breaker.reset();
            return db;
        }
        catch (error) {
            this.init_promise = null; // allow retry on failure
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
    async health() {
        const attempts = boundedParseInt(environment.get('MAX_HEALTH_RETRIES'), {
            min: 1,
            fallback: 3,
        });
        const result = await retry(() => this.ping(), {
            attempts,
            retryIf: (o) => o.ok && o.value.ok === false,
            onRetry: (_o, attempt) => log.warn(`MongoDB health check failed, retrying... (${attempt}/${attempts})`),
        });
        if (this.breaker.record(result.ok))
            await this.close();
        return result;
    }
    /** `closed` (healthy) · `open` (down, connection released) · `half-open` (cooldown elapsed, reconnect). */
    get circuit() {
        return this.breaker.state;
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
        if (this.client) {
            await this.client.close().catch((err) => {
                log.error(err, 'Error closing MongoDB connection');
            });
        }
        this.client = null;
        this.db = null;
        this.init_promise = null;
        log.info('MongoDB connection closed');
    }
}
//# sourceMappingURL=mongodb.connector.js.map