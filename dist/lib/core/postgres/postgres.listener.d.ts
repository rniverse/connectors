import type { Result } from '@rniverse/utils/result';
import { Link, type LinkInit } from '../../shared/link.js';
import type { ListenMeta } from 'postgres';
import type { PostgresConnector } from './postgres.connector.js';
/**
 * LISTEN on one channel, over a dedicated connection postgres.js opens next to
 * the pool. postgres.js re-LISTENs by itself after a dropped connection and
 * calls back each time — that's what marks this `ready` again.
 *
 * postgres.js exposes no state for that connection, so `ping()` checks the
 * connector's pool and that this LISTEN is registered — not the LISTEN socket
 * itself.
 */
export declare class PostgresListener extends Link<ListenMeta> {
    private readonly parent;
    readonly channel: string;
    private readonly onMessage;
    constructor(init: LinkInit & {
        parent: PostgresConnector;
        channel: string;
        onMessage: (payload: unknown) => void;
    });
    protected __open(): Promise<ListenMeta>;
    protected __shut(options: {
        instance: ListenMeta;
    }): Promise<void>;
    protected __ping(): Promise<Result<unknown>>;
}
//# sourceMappingURL=postgres.listener.d.ts.map