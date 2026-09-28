import type { HealthOptions } from './health.type.js';
export type MongoDBConnectorConfig = {
    url: string;
    database?: string;
    appName?: string;
    health?: HealthOptions;
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        connectTimeoutMS?: number;
        socketTimeoutMS?: number;
        serverSelectionTimeoutMS?: number;
        retryWrites?: boolean;
        retryReads?: boolean;
        appName?: string;
    };
};
//# sourceMappingURL=mongodb.type.d.ts.map