// lib/tools/redpanda.tool.ts
// Redpanda connector using KafkaJS (Kafka-compatible)

import { environment } from '@rniverse/utils/env';
import { log } from '@rniverse/utils/logger';
import { Kafka, type KafkaConfig } from 'kafkajs';
import type {
	RedpandaConnectorConfig,
	RedpandaConnectorURLConfig,
} from 'lib/types/redpanda.type';

export function initRedpanda(
	connection: RedpandaConnectorConfig | RedpandaConnectorURLConfig,
) {
	// URL format: 'broker1:port,broker2:port' or single 'broker:port'
	const brokers =
		'url' in connection
			? connection.url.split(',').map((b) => b.trim())
			: connection.brokers;

	const clientId =
		connection.clientId ||
		connection.appName ||
		environment.get('INSTANCE_NAME', 'connectors');

	const kafkaConfig: KafkaConfig = {
		clientId,
		brokers,
		connectionTimeout: connection.connectionTimeout || 10000,
		requestTimeout: connection.requestTimeout || 30000,
	};

	if (connection.ssl !== undefined) {
		kafkaConfig.ssl = connection.ssl;
	}
	if (connection.sasl !== undefined) {
		// Our SASL type is a plain object; kafkajs models it as a discriminated
		// union on `mechanism`, so a cast is needed to bridge the two.
		kafkaConfig.sasl = connection.sasl as KafkaConfig['sasl'];
	}

	// Explicit kafka overrides win over everything above.
	const kafka = new Kafka({ ...kafkaConfig, ...connection.kafka });

	log.info({ clientId, brokers }, 'Redpanda Kafka client created');

	return kafka;
}
