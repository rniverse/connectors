export type MongoDBConnectorConfig = {
    url: string;
    database?: string;
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