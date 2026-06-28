// lib/tools/redpanda.tool.ts
// Redpanda connector using KafkaJS (Kafka-compatible)
import { log } from '@rniverse/utils';
import { Kafka } from 'kafkajs';
export function initRedpanda(connection) {
    let brokers;
    let clientId;
    let connectionTimeout;
    let requestTimeout;
    // Parse URL format or use brokers array
    if ('url' in connection) {
        // URL format: 'broker1:port,broker2:port' or single 'broker:port'
        brokers = connection.url.split(',').map((b) => b.trim());
        clientId = connection.clientId || 'redpanda-connector';
        connectionTimeout = connection.connectionTimeout || 10000;
        requestTimeout = connection.requestTimeout || 30000;
    }
    else {
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
    log.info({ clientId, brokers }, 'Redpanda Kafka client created');
    return kafka;
}
//# sourceMappingURL=redpanda.tool.js.map