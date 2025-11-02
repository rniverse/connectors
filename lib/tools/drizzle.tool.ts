// lib/tools/drizzle.tool.ts
// ref: https://bun.com/docs/runtime/sql#postgresql-options

import { drizzle as createORM } from "drizzle-orm/bun-sql";
import { SQL as BunSQL } from "bun";
import type { SQLConnectorConfig, SQLConnectorOptionsConfig } from "lib/types/sql.type";
import { log } from "@rniverse/utils";

export function initORM(connection: SQLConnectorConfig) {
  const { url, ...rest } = connection;

  // Default pool options (timeouts in seconds for Bun SQL)
  const defaults: Partial<SQLConnectorOptionsConfig> = {
    max: 20,
    idleTimeout: 30,      // 30 seconds
    maxLifetime: 3600,    // 1 hour
    connectionTimeout: 30, // 30 seconds
    prepare: true,
  };

  let bunSQLClient: BunSQL;
  if (typeof url === "string" && url.length > 0) {
    // Merge defaults with URL connection
    const options = { ...defaults, ...rest };
    bunSQLClient = new BunSQL(url, options);
  } else {
    // Merge defaults with host-based config
    const config = { ...defaults, ...rest };
    bunSQLClient = new BunSQL(config);
  }

  // Create ORM client
  const ormClient = createORM(bunSQLClient);

  // Warm up one connection using the BunSQL client directly
  bunSQLClient`SELECT 1`
    .then(() => log.info("DB warm-up successful"))
    .catch((err) => log.warn("Initial DB ping failed", err));

  return ormClient;
}
