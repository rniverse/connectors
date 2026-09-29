// lib/core/mongo/mongo.type.ts

import type { ConnectorOptions } from '@shared/shared.type';

/** The Mongo driver takes a connection string plus options — both passed through as given. */
export type MongoConfig = ConnectorOptions & {
	url: string;
	/** Default for `db()`. Else the URL's database, else the driver's (`test`). */
	database?: string;
	/** Shown in server logs / `currentOp`. Required: this, else the `INSTANCE_NAME` env var. */
	appName?: string;
	options?: {
		/** Default 10. */
		maxPoolSize?: number;
		/** Default 2. */
		minPoolSize?: number;
		/** ms, default 10000. */
		connectTimeoutMS?: number;
		/** ms, default 45000. */
		socketTimeoutMS?: number;
		/** ms, default 10000. */
		serverSelectionTimeoutMS?: number;
		retryWrites?: boolean;
		retryReads?: boolean;
	};
};
