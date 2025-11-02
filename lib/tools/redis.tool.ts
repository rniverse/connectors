// lib/tools/redis.tool.ts
// ref: https://bun.com/docs/runtime/redis#connection-options

import { log } from "@rniverse/utils";
import { RedisClient } from "bun";
import type { RedisConnectorConfig, RedisConnectorOptionsConfig } from "lib/types/redis.type";

export function initRedis(connection: RedisConnectorConfig) {
  const { url, ...rest } = connection;

  // Default connection options
  const defaults: RedisConnectorOptionsConfig = {
    connectionTimeout: 10000, // 10 seconds in milliseconds
    idleTimeout: 30000,       // 30 seconds in milliseconds
    autoReconnect: true,
    maxRetries: 10,
    enableOfflineQueue: true,
    enableAutoPipelining: true,
  };

  // Merge defaults with user options
  const options = { ...defaults, ...rest };

  // Create Redis client
  const redisClient = new RedisClient(url, options);

  // Warm up connection with a simple PING command
  redisClient.send("PING", [])
    .then(() => log.info("Redis warm-up successful"))
    .catch((err) => log.warn("Initial Redis ping failed", err));

  return redisClient;
}
