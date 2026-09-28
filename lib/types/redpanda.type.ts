// lib/types/redpanda.type.ts

import type { KafkaConfig } from 'kafkajs';
import type { HealthOptions } from './health.type';

export type RedpandaTLSConfig =
	| boolean
	| {
			rejectUnauthorized?: boolean;
			ca?: string[];
			cert?: string;
			key?: string;
	  };

export type RedpandaSASLConfig = {
	mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
	username: string;
	password: string;
};

export type RedpandaConnectorCommonConfig = {
	clientId?: string;
	// Used as the Kafka clientId when clientId is not set; shows in broker request
	// logs and quota metrics. Falls back to the INSTANCE_NAME env var when not set.
	appName?: string;
	connectionTimeout?: number;
	requestTimeout?: number;
	ssl?: RedpandaTLSConfig;
	sasl?: RedpandaSASLConfig;
	// Health checks + circuit breaker (see HealthOptions).
	health?: HealthOptions;
	// Additional Kafka config options (spread last — overrides the above)
	kafka?: Partial<KafkaConfig>;
};

export type RedpandaConnectorConfig = RedpandaConnectorCommonConfig & {
	brokers: string[]; // e.g., ['192.168.29.249:19092']
};

export type RedpandaConnectorURLConfig = RedpandaConnectorCommonConfig & {
	url: string; // e.g., '192.168.29.249:19092' or 'broker1:9092,broker2:9092'
};
