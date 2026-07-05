// lib/core/sql.connector.ts
import { log, sleep } from '@rniverse/utils';
import { initORM } from '@tools';
export class SQLConnector {
    client = null;
    config;
    init_promise = null;
    constructor(config) {
        this.config = config;
    }
    /**
     * Connect to SQL database via Drizzle ORM.
     * Creates the ORM client and verifies reachability with SELECT 1.
     * Safe to call multiple times — subsequent calls return the same promise.
     */
    async connect() {
        if (!this.init_promise) {
            this.init_promise = this.__connect();
        }
        return this.init_promise;
    }
    async __connect() {
        try {
            const client = initORM(this.config);
            await client.$client `SELECT 1`;
            this.client = client;
            log.info('SQL connected');
        }
        catch (err) {
            this.init_promise = null; // allow retry on failure
            log.error(err, 'SQL connection failed');
            throw err;
        }
    }
    require_client() {
        if (!this.client)
            throw new Error('SQL not connected — call connect() first');
        return this.client;
    }
    async ping() {
        try {
            await this.require_client().$client `SELECT 1`;
            return { ok: true };
        }
        catch (err) {
            log.error(err, 'SQL ping failed');
            return { ok: false, error: err };
        }
    }
    async health() {
        const maxRetries = Number(process.env.MAX_HEALTH_RETRIES ?? 3);
        let result = { ok: false };
        for (let i = 0; i < maxRetries && !result.ok; i++) {
            if (i > 0) {
                log.warn(`SQL health check failed, retrying... (${i}/${maxRetries})`);
                await sleep(1000 * i);
            }
            result = await this.ping();
        }
        if (!result.ok)
            await this.close();
        return result;
    }
    getInstance() {
        return this.require_client();
    }
    async close() {
        if (this.client) {
            this.client.$client.end().catch((err) => {
                log.error(err, 'Error closing SQL connection');
            });
        }
        this.client = null;
        this.init_promise = null;
        log.info('SQL connection closed');
    }
}
//# sourceMappingURL=sql.connector.js.map