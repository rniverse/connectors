// lib/types/redpanda.type.ts

import type { KafkaConfig, ProducerConfig, ConsumerConfig, AdminConfig } from 'kafkajs';

export type RedpandaConnectorConfig = {
  brokers: string[]; // e.g., ['192.168.29.249:19092']
  clientId?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  ssl?: boolean | {
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
  producer?: Partial<ProducerConfig>;
  consumer?: Partial<ConsumerConfig>;
  admin?: Partial<AdminConfig>;
};

export type RedpandaConnectorURLConfig = {
  url: string; // e.g., '192.168.29.249:19092' or 'broker1:9092,broker2:9092'
  clientId?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
};

export type RedpandaTopicConfig = {
  topic: string;
  numPartitions?: number;
  replicationFactor?: number;
  configEntries?: Array<{
    name: string;
    value: string;
  }>;
};

export type RedpandaMessage = {
  topic: string;
  messages: Array<{
    key?: string;
    value: string;
    headers?: Record<string, string>;
    partition?: number;
  }>;
};

export type RedpandaSubscribeConfig = {
  topics: string[];
  groupId: string;
  fromBeginning?: boolean;
  autoCommit?: boolean;
};
