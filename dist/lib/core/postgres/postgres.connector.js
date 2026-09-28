// lib/core/postgres/postgres.connector.ts
import { Connector } from '../../shared/link.js';
import { appName, setting } from '../../shared/setting.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { client } from './postgres.helper.js';
import { PostgresListener } from './postgres.listener.js';
/**
 * One Postgres database: a postgres.js pool behind a drizzle db. Another
 * database = another connector. Extra connections: `listen()`.
 */
export class PostgresConnector extends Connector {
    config;
    appName;
    closeTimeout;
    constructor(config) {
        super(config);
        this.config = config;
        this.appName = appName({ value: config.appName, connector: config.name });
        this.closeTimeout = setting({
            value: config.closeTimeout,
            env: 'SQL_CLOSE_TIMEOUT_S',
            min: 0,
            fallback: 5,
        });
    }
    /** LISTEN on `channel` over its own connection. */
    listen(options) {
        const { channel, onMessage, ...link } = options;
        return new PostgresListener({
            ...this.__child(link),
            parent: this,
            channel,
            onMessage,
        });
    }
    get listeners() {
        return this.scope.of({ kind: PostgresListener });
    }
    async __open() {
        const sql = client({ config: this.config, appName: this.appName });
        try {
            await sql `SELECT 1`;
        }
        catch (error) {
            await sql.end({ timeout: 0 }).catch(() => { });
            throw error;
        }
        const { schema } = this.config;
        return (schema ? drizzle(sql, { schema }) : drizzle(sql));
    }
    async __shut(options) {
        await options.instance.$client.end({ timeout: this.closeTimeout });
    }
    async __ping(options) {
        await options.instance.$client `SELECT 1`;
        return { ok: true };
    }
}
//# sourceMappingURL=postgres.connector.js.map