// lib/core/mongo/mongo.connector.ts
import { Connector } from '../../shared/link.js';
import { appName } from '../../shared/setting.js';
import { MongoClient } from 'mongodb';
import { options } from './mongo.helper.js';
/**
 * One Mongo cluster — `getInstance()` is the `MongoClient`. Many databases on
 * the same pool via `db(name)`; no extra connections to track.
 *
 * State also follows the driver's server heartbeats: a failed heartbeat marks
 * it `failed`, the next successful one `ready` again (`recover`).
 */
export class MongoConnector extends Connector {
    url;
    database;
    settings;
    constructor(config) {
        super(config);
        this.url = config.url;
        this.database = config.database;
        this.settings = options({
            config,
            appName: appName({ value: config.appName, connector: config.name }),
        });
    }
    /** A database on the same pool. Default: `config.database`, else the URL's. */
    db(name) {
        return this.getInstance().db(name ?? this.database);
    }
    async __open() {
        const epoch = this.__epoch();
        const client = new MongoClient(this.url, this.settings);
        client.on('serverHeartbeatFailed', (event) => this.__mark({ state: 'failed', epoch, error: event.failure }));
        client.on('serverHeartbeatSucceeded', () => this.__mark({ state: 'ready', epoch }));
        try {
            await client.connect();
            await client.db(this.database).admin().ping();
        }
        catch (error) {
            await client.close().catch(() => { });
            throw error;
        }
        return client;
    }
    async __shut(options) {
        await options.instance.close();
    }
    async __ping(options) {
        return {
            ok: true,
            data: await options.instance.db(this.database).admin().ping(),
        };
    }
}
//# sourceMappingURL=mongo.connector.js.map