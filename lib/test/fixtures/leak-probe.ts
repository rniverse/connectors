// lib/test/fixtures/leak-probe.ts
//
// Run as: `bun lib/test/fixtures/leak-probe.ts <sql|mongo>`
// Does one failed connect() against an unreachable address, then does nothing.
// If the connector cleaned up its pool / reconnect timer / topology monitor,
// the event loop drains and this process exits on its own (code 0).
// If it leaked a handle, this process hangs forever — the test that spawned it
// then times out.

import { MongoDBConnector } from '../../core/mongodb.connector';
import { SQLConnector } from '../../core/sql.connector';

const driver = process.argv[2];

async function main() {
	if (driver === 'sql') {
		// Unreachable port → postgres.js would otherwise retry on a timer forever.
		const c = new SQLConnector({
			url: 'postgres://probe:probe@127.0.0.1:5455/probe',
			connectionTimeout: 2,
		});
		await c.connect().catch(() => {});
		return;
	}

	if (driver === 'mongo') {
		// Unreachable address → the driver's topology monitor keeps a heartbeat
		// interval unless the client is closed.
		const c = new MongoDBConnector({
			url: 'mongodb://127.0.0.1:27099/probe',
			options: { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 },
		});
		await c.connect().catch(() => {});
		return;
	}

	throw new Error(`unknown driver: ${driver}`);
}

await main();
// Intentionally no process.exit() — the point is whether we exit unaided.
