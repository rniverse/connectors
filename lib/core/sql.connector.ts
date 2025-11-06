// lib/core/sql.connector.ts

import { log } from '@rniverse/utils';
import { initORM } from '@tools';
import type { SQLConnectorConfig } from '@type/sql.type';

export class SQLConnector {
	client: ReturnType<typeof initORM> | null = null;
	config: SQLConnectorConfig;

	constructor(config: SQLConnectorConfig) {
		this.config = config;
		this.client = initORM(this.config);
	}

	ping() {
		log.info('sample');
		log.info(`Pinging DB... ${JSON.stringify(this.client)}`);
		if (!this.client) {
			return Promise.resolve({ ok: false });
		}

		// Access the underlying Bun SQL client for raw queries
		return this.client.$client`SELECT 1`
			.then(() => {
				log.info('Ping DB successful');
				return { ok: true };
			})
			.catch((err: Error) => {
				log.error('Ping DB failed %s', err);
				return { ok: false };
			});
	}

	health() {
		return this.ping();
	}

	initialize() {}

	getInstance() {
		return this.client;
	}
}
