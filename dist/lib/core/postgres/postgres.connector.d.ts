import type { Result } from '@rniverse/utils/result';
import { Connector, type Links } from '../../shared/link.js';
import { PostgresListener } from './postgres.listener.js';
import type { PostgresConfig, PostgresDatabase, PostgresSchema } from './postgres.type.js';
/**
 * One Postgres database: a postgres.js pool behind a drizzle db. Another
 * database = another connector. Extra connections: `listeners` (config).
 */
export declare class PostgresConnector<TSchema extends PostgresSchema = PostgresSchema> extends Connector<PostgresDatabase<TSchema>> {
    private readonly config;
    private readonly appName;
    private readonly closeTimeout;
    constructor(config: PostgresConfig<TSchema>);
    get listeners(): Links<PostgresListener>;
    protected __open(): Promise<PostgresDatabase<TSchema>>;
    protected __shut(options: {
        instance: PostgresDatabase<TSchema>;
    }): Promise<void>;
    protected __ping(options: {
        instance: PostgresDatabase<TSchema>;
    }): Promise<Result<unknown>>;
}
//# sourceMappingURL=postgres.connector.d.ts.map