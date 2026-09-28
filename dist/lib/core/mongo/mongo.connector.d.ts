import type { Result } from '@rniverse/utils/result';
import { Link } from '../../shared/link.js';
import { type Db, MongoClient } from 'mongodb';
import type { MongoConfig } from './mongo.type.js';
/**
 * One Mongo cluster — `getInstance()` is the `MongoClient`. Many databases on
 * the same pool via `db(name)`; no extra connections to track.
 *
 * State also follows the driver's server heartbeats: a failed heartbeat marks
 * it `failed`, the next successful one `ready` again.
 */
export declare class MongoConnector extends Link<MongoClient> {
    private readonly url;
    private readonly database;
    private readonly settings;
    constructor(config: MongoConfig);
    /** A database on the same pool. Default: `config.database`, else the URL's. */
    db(name?: string): Db;
    protected __open(): Promise<MongoClient>;
    protected __shut(options: {
        instance: MongoClient;
    }): Promise<void>;
    protected __ping(options: {
        instance: MongoClient;
    }): Promise<Result<unknown>>;
}
//# sourceMappingURL=mongo.connector.d.ts.map