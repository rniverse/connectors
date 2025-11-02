// lib/test/redpanda.test.ts
import { RedpandaConnector } from '@core/redpanda.connector';
import { log } from '@rniverse/utils';
import { describe, test, expect } from 'bun:test';

describe('Redpanda Tool Tests', () => {
  test('Sample Test', () => {
    expect(1 + 1).toBe(2);
  });

  test('Redpanda Connection Test', async () => {
    const connector = new RedpandaConnector({ 
      url: process.env.REDPANDA_URL || 'localhost:9092' 
    });
    
    const result = await connector.health();
    log.info(`Health Check Result: ${JSON.stringify(result)}`);
    expect(result.ok).toBe(true);
    
    // Clean up
    await connector.close();
  });

  test('Redpanda Topic Operations', async () => {
    const connector = new RedpandaConnector({ 
      url: process.env.REDPANDA_URL || 'localhost:9092' 
    });

    const testTopic = `test-topic-${Date.now()}`;

    // Create topic
    const createResult = await connector.createTopic({
      topic: testTopic,
      numPartitions: 1,
      replicationFactor: 1,
    });
    log.info(`Create Topic Result: ${JSON.stringify(createResult)}`);
    expect(createResult.ok).toBe(true);

    // List topics
    const listResult = await connector.listTopics();
    log.info(`List Topics Result: ${JSON.stringify(listResult)}`);
    expect(listResult.ok).toBe(true);
    expect(listResult.topics).toContain(testTopic);

    // Delete topic
    const deleteResult = await connector.deleteTopic(testTopic);
    log.info(`Delete Topic Result: ${JSON.stringify(deleteResult)}`);
    expect(deleteResult.ok).toBe(true);

    // Clean up
    await connector.close();
  });

  test('Redpanda Publish Message', async () => {
    const connector = new RedpandaConnector({ 
      url: process.env.REDPANDA_URL || 'localhost:9092' 
    });

    const testTopic = `test-pub-topic-${Date.now()}`;

    // Create topic first
    await connector.createTopic({
      topic: testTopic,
      numPartitions: 1,
      replicationFactor: 1,
    });

    // Publish message
    const publishResult = await connector.publish({
      topic: testTopic,
      messages: [
        {
          key: 'test-key',
          value: JSON.stringify({ message: 'Hello Redpanda!' }),
        },
      ],
    });
    log.info(`Publish Result: ${JSON.stringify(publishResult)}`);
    expect(publishResult.ok).toBe(true);

    // Clean up
    await connector.deleteTopic(testTopic);
    await connector.close();
  });

  test('Redpanda Subscribe and Consume Messages', async () => {
    const connector = new RedpandaConnector({ 
      url: process.env.REDPANDA_URL || 'localhost:9092' 
    });

    const testTopic = `test-consume-topic-${Date.now()}`;
    const receivedMessages: any[] = [];

    // Create topic
    await connector.createTopic({
      topic: testTopic,
      numPartitions: 1,
      replicationFactor: 1,
    });

    // Publish some messages first
    await connector.publish({
      topic: testTopic,
      messages: [
        { key: 'msg1', value: JSON.stringify({ id: 1, text: 'Message 1' }) },
        { key: 'msg2', value: JSON.stringify({ id: 2, text: 'Message 2' }) },
        { key: 'msg3', value: JSON.stringify({ id: 3, text: 'Message 3' }) },
      ],
    });

    // Subscribe with message handler
    await connector.subscribe(
      {
        topics: [testTopic],
        groupId: `test-group-${Date.now()}`,
        fromBeginning: true,
      },
      async (payload) => {
        const parsed = JSON.parse(payload.message.value?.toString() || '{}');
        receivedMessages.push(parsed);
        log.info(`Consumed message: ${JSON.stringify(parsed)}`);
      }
    );

    // Wait for messages to be consumed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify messages received
    expect(receivedMessages.length).toBe(3);
    expect(receivedMessages[0].id).toBe(1);
    expect(receivedMessages[1].id).toBe(2);
    expect(receivedMessages[2].id).toBe(3);

    // Clean up
    await connector.deleteTopic(testTopic);
    await connector.close();
  }, 10000);

  test('Redpanda Subscribe to Multiple Topics', async () => {
    const connector = new RedpandaConnector({ 
      url: process.env.REDPANDA_URL || 'localhost:9092' 
    });

    const topic1 = `test-multi-topic1-${Date.now()}`;
    const topic2 = `test-multi-topic2-${Date.now()}`;
    const receivedMessages: any[] = [];

    // Create topics
    await connector.createTopic({ topic: topic1, numPartitions: 1, replicationFactor: 1 });
    await connector.createTopic({ topic: topic2, numPartitions: 1, replicationFactor: 1 });

    // Publish to both topics
    await connector.publish({
      topic: topic1,
      messages: [{ key: 't1', value: JSON.stringify({ source: 'topic1', data: 'A' }) }],
    });
    await connector.publish({
      topic: topic2,
      messages: [{ key: 't2', value: JSON.stringify({ source: 'topic2', data: 'B' }) }],
    });

    // Subscribe to multiple topics
    await connector.subscribe(
      {
        topics: [topic1, topic2],
        groupId: `test-multi-group-${Date.now()}`,
        fromBeginning: true,
      },
      async (payload) => {
        const parsed = JSON.parse(payload.message.value?.toString() || '{}');
        receivedMessages.push(parsed);
        log.info(`Multi-topic consumed: ${JSON.stringify(parsed)}`);
      }
    );

    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify messages from both topics
    expect(receivedMessages.length).toBe(2);
    const sources = receivedMessages.map(m => m.source);
    expect(sources).toContain('topic1');
    expect(sources).toContain('topic2');

    // Clean up
    await connector.deleteTopic(topic1);
    await connector.deleteTopic(topic2);
    await connector.close();
  }, 10000);
});
