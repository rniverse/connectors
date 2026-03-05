// lib/types/redpanda.type.ts

import type {
	AdminConfig,
	ConsumerConfig,
	KafkaConfig,
	ProducerConfig,
} from 'kafkajs';

export type RedpandaConnectorConfig = {
	brokers: string[]; // e.g., ['192.168.29.249:19092']
	clientId?: string;
	connectionTimeout?: number;
	requestTimeout?: number;
	ssl?:
	| boolean
	| {
		rejectUnauthorized?: boolean;
		ca?: string[];
		cert?: string;
		key?: string;
	};
	sasl?: {
		mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
		username: string;
		password: string;
	};
	// Additional Kafka config options
	kafka?: Partial<KafkaConfig>;
};

export type RedpandaConnectorURLConfig = {
	url: string; // e.g., '192.168.29.249:19092' or 'broker1:9092,broker2:9092'
	clientId?: string;
	connectionTimeout?: number;
	requestTimeout?: number;
};
