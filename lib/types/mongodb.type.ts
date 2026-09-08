// lib/types/mongodb.type.ts

export type MongoDBConnectorConfig = {
	url: string; // e.g., 'mongodb://localhost:27017/mydb'
	database?: string; // Optional - can be included in URL or specified separately
	// Identifies this app/instance in server logs, db.currentOp() and the profiler.
	// Falls back to the INSTANCE_NAME env var when not set.
	appName?: string;
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
