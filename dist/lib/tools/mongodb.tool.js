// lib/tools/mongodb.tool.ts
import { environment } from '@rniverse/utils/env';
import { log } from '@rniverse/utils/logger';
import { MongoClient } from 'mongodb';
const defaultOptions = {
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
};
export async function initMongoDB(config) {
    log.info('Initializing MongoDB client...');
    let mongoClient = null;
    try {
        const appName = config.appName ??
            config.options?.appName ??
            environment.get('INSTANCE_NAME', 'connectors');
        const options = { ...defaultOptions, ...config.options, appName };
        mongoClient = new MongoClient(config.url, options);
        await mongoClient.connect();
        // Use the configured database, or fall back to the one in the connection
        // string (mongoClient.db(undefined) resolves it, else defaults to 'test').
        const database = mongoClient.db(config.database);
        // Test connection
        await database.admin().ping();
        log.info('MongoDB warm-up successful');
        return { client: mongoClient, db: database };
    }
    catch (error) {
        log.error(error, 'Failed to initialize MongoDB');
        await mongoClient?.close().catch((closeError) => {
            log.error(closeError, 'Failed to close MongoDB client after initialization failure');
        });
        throw error;
    }
}
export async function closeMongoDB(client) {
    if (client) {
        await client.close();
        log.info('MongoDB connection closed');
    }
}
//# sourceMappingURL=mongodb.tool.js.map