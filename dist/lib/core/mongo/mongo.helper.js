// lib/core/mongo/mongo.helper.ts
const DEFAULTS = {
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 10_000,
    retryWrites: true,
    retryReads: true,
};
/** Our config → MongoClient options. */
export function options(options) {
    return { ...DEFAULTS, ...options.config.options, appName: options.appName };
}
//# sourceMappingURL=mongo.helper.js.map