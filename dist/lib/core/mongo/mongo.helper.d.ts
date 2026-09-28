import type { MongoClientOptions } from 'mongodb';
import type { MongoConfig } from './mongo.type.js';
/** Our config → MongoClient options. */
export declare function options(options: {
    config: MongoConfig;
    appName: string;
}): MongoClientOptions;
//# sourceMappingURL=mongo.helper.d.ts.map