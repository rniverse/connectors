// lib/tools/redpanda.tool.ts
// Redpanda connector using KafkaJS (Kafka-compatible)

import { Kafka, Partitioners } from 'kafkajs';
import type { RedpandaConnectorConfig, RedpandaConnectorURLConfig } from 'lib/types/redpanda.type';

export function initRedpanda(connection: RedpandaConnectorConfig | RedpandaConnectorURLConfig) {
  let brokers: string[];
  let clientId: string;
  let connectionTimeout: number;
  let requestTimeout: number;

  // Parse URL format or use brokers array
  if ('url' in connection) {
    // URL format: 'broker1:port,broker2:port' or single 'broker:port'
    brokers = connection.url.split(',').map(b => b.trim());
    clientId = connection.clientId || 'redpanda-connector';
    connectionTimeout = connection.connectionTimeout || 10000;
    requestTimeout = connection.requestTimeout || 30000;
  } else {
    brokers = connection.brokers;
    clientId = connection.clientId || 'redpanda-connector';
    connectionTimeout = connection.connectionTimeout || 10000;
    requestTimeout = connection.requestTimeout || 30000;
  }

  // Create Kafka client (compatible with Redpanda)
  const kafka = new Kafka({
    clientId,
    brokers,
    connectionTimeout,
    requestTimeout,
    ...('kafka' in connection ? connection.kafka : {}),
  });

  // Warm up connection by creating and immediately disconnecting an admin client
  const warmupAdmin = kafka.admin();
  warmupAdmin.connect()
    .then(() => {
      console.log('Redpanda warm-up successful');
      return warmupAdmin.disconnect();
    })
    .catch((err: Error) => {
      console.warn('Initial Redpanda connection failed', err);
    });

  return kafka;
}
