// lib/core/redpanda.connector.ts

import { initRedpanda } from '@tools/redpanda.tool';
import type { 
  RedpandaConnectorConfig, 
  RedpandaConnectorURLConfig,
  RedpandaTopicConfig,
  RedpandaMessage,
  RedpandaSubscribeConfig 
} from '@type/redpanda.type';
import { log } from '@utils';
import type { Admin, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { Partitioners } from 'kafkajs';

export class RedpandaConnector {
  private kafka: ReturnType<typeof initRedpanda>;
  private adminClient: Admin | null = null;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  config: RedpandaConnectorConfig | RedpandaConnectorURLConfig;

  constructor(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig) {
    this.config = config;
    this.kafka = initRedpanda(this.config);
  }

  private async getAdmin(): Promise<Admin> {
    if (!this.adminClient) {
      this.adminClient = this.kafka.admin();
      await this.adminClient.connect();
      log.info('Redpanda admin client connected');
    }
    return this.adminClient;
  }

  private async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        createPartitioner: Partitioners.DefaultPartitioner,
        ...('producer' in this.config ? this.config.producer : {}),
      });
      await this.producer.connect();
      log.info('Redpanda producer connected');
    }
    return this.producer;
  }

  private async getConsumer(groupId: string): Promise<Consumer> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId,
        ...('consumer' in this.config ? this.config.consumer : {}),
      });
      await this.consumer.connect();
      log.info(`Redpanda consumer connected with groupId: ${groupId}`);
    }
    return this.consumer;
  }

  async ping() {
    log.info('Pinging Redpanda...');
    try {
      const admin = await this.getAdmin();
      await admin.listTopics();
      log.info('Redpanda ping successful');
      return { ok: true };
    } catch (err) {
      log.error(`Redpanda ping failed: ${JSON.stringify(err)}`);
      return { ok: false };
    }
  }

  async health() {
    return this.ping();
  }

  async createTopic(config: RedpandaTopicConfig) {
    log.info(`Creating topic: ${config.topic}`);
    try {
      const admin = await this.getAdmin();
      await admin.createTopics({
        topics: [{
          topic: config.topic,
          numPartitions: config.numPartitions || 1,
          replicationFactor: config.replicationFactor || 1,
          configEntries: config.configEntries,
        }],
      });
      log.info(`Topic created successfully: ${config.topic}`);
      return { ok: true };
    } catch (err) {
      log.error(`Failed to create topic: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async listTopics() {
    log.info('Listing topics...');
    try {
      const admin = await this.getAdmin();
      const topics = await admin.listTopics();
      log.info(`Found ${topics.length} topics`);
      return { ok: true, topics };
    } catch (err) {
      log.error(`Failed to list topics: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async deleteTopic(topic: string) {
    log.info(`Deleting topic: ${topic}`);
    try {
      const admin = await this.getAdmin();
      await admin.deleteTopics({
        topics: [topic],
      });
      log.info(`Topic deleted successfully: ${topic}`);
      return { ok: true };
    } catch (err) {
      log.error(`Failed to delete topic: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async fetchTopicMetadata(topics?: string[]) {
    log.info('Fetching topic metadata...');
    try {
      const admin = await this.getAdmin();
      const metadata = await admin.fetchTopicMetadata(topics ? { topics } : undefined);
      log.info('Topic metadata fetched successfully');
      return { ok: true, metadata };
    } catch (err) {
      log.error(`Failed to fetch topic metadata: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async publish(message: RedpandaMessage) {
    log.info(`Publishing message to topic: ${message.topic}`);
    try {
      const producer = await this.getProducer();
      const result = await producer.send({
        topic: message.topic,
        messages: message.messages.map(msg => ({
          key: msg.key,
          value: msg.value,
          headers: msg.headers,
          partition: msg.partition,
        })),
      });
      log.info(`Message published successfully to ${message.topic}`);
      return { ok: true, result };
    } catch (err) {
      log.error(`Failed to publish message: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async subscribe(
    config: RedpandaSubscribeConfig,
    handler: (payload: EachMessagePayload) => Promise<void>
  ) {
    log.info(`Subscribing to topics: ${config.topics.join(', ')} with group: ${config.groupId}`);
    try {
      const consumer = await this.getConsumer(config.groupId);
      
      for (const topic of config.topics) {
        await consumer.subscribe({ 
          topic, 
          fromBeginning: config.fromBeginning || false 
        });
      }

      await consumer.run({
        autoCommit: config.autoCommit !== false,
        eachMessage: handler,
      });

      log.info('Consumer started successfully');
      return { ok: true, consumer };
    } catch (err) {
      log.error(`Failed to subscribe: ${JSON.stringify(err)}`);
      return { ok: false, error: err };
    }
  }

  async unsubscribe() {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
      log.info('Consumer unsubscribed and disconnected');
    }
  }

  async close() {
    log.info('Closing Redpanda connections...');
    
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
      log.info('Producer disconnected');
    }

    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
      log.info('Consumer disconnected');
    }

    if (this.adminClient) {
      await this.adminClient.disconnect();
      this.adminClient = null;
      log.info('Admin client disconnected');
    }

    log.info('All Redpanda connections closed');
  }

  getInstance() {
    return this.kafka;
  }

  getAdminInstance() {
    return this.adminClient;
  }

  getProducerInstance() {
    return this.producer;
  }

  getConsumerInstance() {
    return this.consumer;
  }

  initialize() {
  }
}
