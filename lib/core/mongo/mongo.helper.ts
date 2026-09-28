// lib/core/mongo/mongo.helper.ts

import type { MongoClientOptions } from 'mongodb';
import type { MongoConfig } from './mongo.type';

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
export function options(options: {
	config: MongoConfig;
	appName: string;
}): MongoClientOptions {
	return { ...DEFAULTS, ...options.config.options, appName: options.appName };
}
