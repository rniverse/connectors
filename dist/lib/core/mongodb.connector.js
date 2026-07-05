// lib/core/mongodb.connector.ts
import { log, sleep } from '@rniverse/utils';
import { initMongoDB } from '@tools/mongodb.tool';
export class MongoDBConnector {
    db = null;
    client = null;
    config;
    init_promise = null;
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
        const maxRetries = Number(process.env.MAX_HEALTH_RETRIES ?? 3);
        let result = { ok: false };
        for (let i = 0; i < maxRetries && !result.ok; i++) {
            if (i > 0) {
                log.warn(`MongoDB health check failed, retrying... (${i}/${maxRetries})`);
                await sleep(1000 * i);
            }
            result = await this.ping();
        }
        if (!result.ok)
            await this.close();
        return result;
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