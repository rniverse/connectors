// lib/core/kafka/kafka.helper.ts

import { Kafka, type KafkaConfig as KafkaJsConfig } from 'kafkajs';
import type { KafkaConfig } from './kafka.type';

/** An array as-is; a comma-separated string split and trimmed. */
export function brokers(options: { value: string | string[] }): string[] {
	const { value } = options;
	if (Array.isArray(value)) return value;
	return value
		.split(',')
		.map((broker) => broker.trim())
		.filter(Boolean);
}

/** Our config → a kafkajs `Kafka` client (no connection yet). */
export function client(options: {
	config: KafkaConfig;
	appName: string;
}): Kafka {
	const { config } = options;
	const settings: KafkaJsConfig = {
		clientId: options.appName,
		brokers: brokers({ value: config.brokers }),
		connectionTimeout: config.connectionTimeout ?? 10_000,
		requestTimeout: config.requestTimeout ?? 30_000,
		...(config.ssl !== undefined && { ssl: config.ssl }),
		// kafkajs models SASL as a union on `mechanism`; ours is one plain shape.
		...(config.sasl !== undefined && {
			sasl: config.sasl as KafkaJsConfig['sasl'],
		}),
	};
	return new Kafka({ ...settings, ...config.kafka });
}
