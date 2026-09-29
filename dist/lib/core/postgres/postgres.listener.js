// lib/core/postgres/postgres.listener.ts
import { Link } from '../../shared/link.js';
import { payload } from './postgres.helper.js';
/**
 * LISTEN on one channel, over a dedicated connection postgres.js opens next to
 * the pool. Each NOTIFY is a `message` event. postgres.js re-LISTENs by itself
 * after a dropped connection and calls back each time — that's what marks this
 * `ready` again.
 *
 * postgres.js exposes no state for that connection, so `ping()` checks the
 * connector's pool — not the LISTEN socket itself.
 */
export class PostgresListener extends Link {
    database;
    channel;
    constructor(init) {
        super(init);
        this.database = init.database;
        this.channel = init.channel;
    }
    async __open() {
        const sql = this.database.getInstance().$client;
        const epoch = this.__epoch();
        return sql.listen(this.channel, (raw) => this.__emit('message', payload({ raw })), () => this.__mark({ state: 'ready', epoch }));
    }
    async __shut(options) {
        await options.instance.unlisten();
    }
    async __ping() {
        return this.database.ping();
    }
}
//# sourceMappingURL=postgres.listener.js.map