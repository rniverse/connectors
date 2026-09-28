import { type Sql } from 'postgres';
import type { PostgresConfig } from './postgres.type.js';
/** A postgres.js client for the config: `url` and fields as given — never parsed. */
export declare function client(options: {
    config: PostgresConfig;
    appName: string;
}): Sql;
/** A NOTIFY payload: parsed JSON when it parses, else the raw string. */
export declare function payload(options: {
    raw: string;
}): unknown;
//# sourceMappingURL=postgres.helper.d.ts.map