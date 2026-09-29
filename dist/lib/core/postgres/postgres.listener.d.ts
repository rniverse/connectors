import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import type { ListenMeta } from 'postgres';
import type { PostgresConnector } from './postgres.connector.js';
import type { PostgresListenerEvents } from './postgres.type.js';
/**
 * LISTEN on one channel, over a dedicated connection postgres.js opens next to
 * the pool. Each NOTIFY is a `message` event. postgres.js re-LISTENs by itself
 * after a dropped connection and calls back each time — that's what marks this
 * `ready` again.
 *
 * postgres.js exposes no state for that connection, so `ping()` checks the
 * connector's pool — not the LISTEN socket itself.
 */
export declare class PostgresListener extends Link<ListenMeta, PostgresListenerEvents> {
    private readonly database;
    readonly channel: string;
    constructor(init: LinkInit & {
        database: PostgresConnector;
        channel: string;
    });
    protected __open(): Promise<ListenMeta>;
    protected __shut(options: {
        instance: ListenMeta;
    }): Promise<void>;
    protected __ping(): Promise<Result<unknown>>;
}
//# sourceMappingURL=postgres.listener.d.ts.map