// lib/test/redpanda.test.ts

import { afterAll, describe, expect, test } from 'bun:test';
import { RedpandaConnector } from '@core/redpanda.connector';
import { log } from '@rniverse/utils';
import type { Admin, Consumer, Producer } from 'kafkajs';

const REDPANDA_URL = process.env.REDPANDA_URL || 'localhost:9092';

describe('Redpanda Connector Tests', () => {
	let connector: RedpandaConnector;
	let admin: Admin;

	afterAll(async () => {
		await connector.close();
	});

	test('Connect and Health Check', async () => {
		connector = new RedpandaConnector({ url: REDPANDA_URL });
		admin = await connector.connect();

		const result = await connector.health();
		log.info(`Health Check Result: ${JSON.stringify(result)}`);
		expect(result.ok).toBe(true);
	});

	test('Admin - Topic Operations', async () => {
		const testTopic = `test-topic-${Date.now()}`;

		// Create topic
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// List topics
		const topics = await admin.listTopics();
		expect(topics).toContain(testTopic);

		// Delete topic
		await admin.deleteTopics({ topics: [testTopic] });
		log.info({ topic: testTopic }, 'Topic lifecycle complete');
	});

	test('Producer - Publish Messages', async () => {
		const testTopic = `test-pub-topic-${Date.now()}`;

		// Create topic via admin
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// Get producer, publish, then disconnect
		const producer = await connector.getProducer();

		const result = await producer.send({
			topic: testTopic,
			messages: [
				{ key: 'test-key', value: JSON.stringify({ message: 'Hello Redpanda!' }) },
			],
		});
		log.info(`Publish Result: ${JSON.stringify(result)}`);
		expect(result).toBeDefined();
		expect(result[0]?.errorCode).toBe(0);

		await producer.disconnect();

		// Clean up topic
		await admin.deleteTopics({ topics: [testTopic] });
	});

	test('Consumer - Subscribe and Consume Messages', async () => {
		const testTopic = `test-consume-topic-${Date.now()}`;
		const receivedMessages: any[] = [];

		// Create topic
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// Produce messages
		const producer = await connector.getProducer();
		await producer.send({
			topic: testTopic,
			messages: [
				{ key: 'msg1', value: JSON.stringify({ id: 1, text: 'Message 1' }) },
				{ key: 'msg2', value: JSON.stringify({ id: 2, text: 'Message 2' }) },
				{ key: 'msg3', value: JSON.stringify({ id: 3, text: 'Message 3' }) },
			],
		});
		await producer.disconnect();

		// Get consumer, subscribe, consume
		const consumer = await connector.getConsumer({
			groupId: `test-group-${Date.now()}`,
		});

		await consumer.subscribe({ topic: testTopic, fromBeginning: true });
		await consumer.run({
			eachMessage: async ({ message }) => {
				const parsed = JSON.parse(message.value?.toString() || '{}');
				receivedMessages.push(parsed);
				log.info(`Consumed message: ${JSON.stringify(parsed)}`);
			},
		});

		// Wait for messages to be consumed
		await new Promise((resolve) => setTimeout(resolve, 3000));

		expect(receivedMessages.length).toBe(3);
		expect(receivedMessages[0].id).toBe(1);
		expect(receivedMessages[1].id).toBe(2);
		expect(receivedMessages[2].id).toBe(3);

		// Clean up
		await consumer.disconnect();
		await admin.deleteTopics({ topics: [testTopic] });
	}, 10000);

	test('Consumer - Subscribe to Multiple Topics', async () => {
		const topic1 = `test-multi-topic1-${Date.now()}`;
		const topic2 = `test-multi-topic2-${Date.now()}`;
		const receivedMessages: any[] = [];

		// Create topics
		await admin.createTopics({
			topics: [
				{ topic: topic1, numPartitions: 1, replicationFactor: 1 },
				{ topic: topic2, numPartitions: 1, replicationFactor: 1 },
			],
		});

		// Produce to both topics
		const producer = await connector.getProducer();
		await producer.send({
			topic: topic1,
			messages: [{ key: 't1', value: JSON.stringify({ source: 'topic1', data: 'A' }) }],
		});
		await producer.send({
			topic: topic2,
			messages: [{ key: 't2', value: JSON.stringify({ source: 'topic2', data: 'B' }) }],
		});
		await producer.disconnect();

		// Get consumer, subscribe to both
		const consumer = await connector.getConsumer({
			groupId: `test-multi-group-${Date.now()}`,
		});

		await consumer.subscribe({ topics: [topic1, topic2], fromBeginning: true });
		await consumer.run({
			eachMessage: async ({ message }) => {
				const parsed = JSON.parse(message.value?.toString() || '{}');
				receivedMessages.push(parsed);
				log.info(`Multi-topic consumed: ${JSON.stringify(parsed)}`);
			},
		});

		// Wait for messages
		await new Promise((resolve) => setTimeout(resolve, 3000));

		expect(receivedMessages.length).toBe(2);
		const sources = receivedMessages.map((m) => m.source);
		expect(sources).toContain('topic1');
		expect(sources).toContain('topic2');

		// Clean up
		await consumer.disconnect();
		await admin.deleteTopics({ topics: [topic1, topic2] });
	}, 20000);

	test('Error Handling - Message Retry on Error', async () => {
		const testTopic = `test-retry-topic-${Date.now()}`;
		const attempts: any[] = [];

		// Create topic
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// Produce a message
		const producer = await connector.getProducer();
		await producer.send({
			topic: testTopic,
			messages: [{ key: 'retry-msg', value: JSON.stringify({ id: 1, text: 'Retry me' }) }],
		});
		await producer.disconnect();

		// Consumer that fails on first attempt, succeeds on second
		let attempt_count = 0;
		const consumer = await connector.getConsumer({
			groupId: `test-retry-group-${Date.now()}`,
			retry: { retries: 3 },
		});

		await consumer.subscribe({ topic: testTopic, fromBeginning: true });
		await consumer.run({
			autoCommit: true,
			eachMessage: async ({ message }) => {
				attempt_count++;
				const parsed = JSON.parse(message.value?.toString() || '{}');
				attempts.push({ attempt: attempt_count, ...parsed });
				log.info(`Attempt ${attempt_count}: ${JSON.stringify(parsed)}`);

				if (attempt_count === 1) {
					throw new Error('Simulated processing failure');
				}
				// Second attempt succeeds
			},
		});

		// Wait for retry cycle
		await new Promise((resolve) => setTimeout(resolve, 8000));

		// Message should have been attempted more than once
		expect(attempts.length).toBeGreaterThanOrEqual(2);
		expect(attempts[0].id).toBe(1);
		expect(attempts[1].id).toBe(1);
		log.info(`Total attempts: ${attempts.length}`);

		await consumer.disconnect();
		await admin.deleteTopics({ topics: [testTopic] });
	}, 20000);

	test('Error Handling - Dead Letter Queue Pattern', async () => {
		const sourceTopic = `test-dlq-source-${Date.now()}`;
		const dlqTopic = `test-dlq-dead-${Date.now()}`;
		const processed: any[] = [];
		const deadLettered: any[] = [];

		// Create both topics
		await admin.createTopics({
			topics: [
				{ topic: sourceTopic, numPartitions: 1, replicationFactor: 1 },
				{ topic: dlqTopic, numPartitions: 1, replicationFactor: 1 },
			],
		});

		// Produce: 1 good message, 1 bad (will fail processing), 1 good
		const producer = await connector.getProducer();
		await producer.send({
			topic: sourceTopic,
			messages: [
				{ key: 'good-1', value: JSON.stringify({ id: 1, action: 'process' }) },
				{ key: 'bad-1', value: JSON.stringify({ id: 2, action: 'fail' }) },
				{ key: 'good-2', value: JSON.stringify({ id: 3, action: 'process' }) },
			],
		});

		// Consumer with DLQ pattern: catch errors, forward to DLQ, don't rethrow
		const consumer = await connector.getConsumer({
			groupId: `test-dlq-group-${Date.now()}`,
		});

		await consumer.subscribe({ topic: sourceTopic, fromBeginning: true });
		await consumer.run({
			eachMessage: async ({ message, topic, partition }) => {
				const parsed = JSON.parse(message.value?.toString() || '{}');

				try {
					// Simulate processing — "fail" action throws
					if (parsed.action === 'fail') {
						throw new Error(`Cannot process message id=${parsed.id}`);
					}
					processed.push(parsed);
					log.info(`Processed: ${JSON.stringify(parsed)}`);
				} catch (err: any) {
					// DLQ: forward the failed message to the dead letter topic
					await producer.send({
						topic: dlqTopic,
						messages: [{
							key: message.key?.toString(),
							value: JSON.stringify({
								original_message: parsed,
								error: err.message,
								source_topic: topic,
								source_partition: partition,
								source_offset: message.offset,
								failed_at: new Date().toISOString(),
							}),
						}],
					});
					log.info(`Dead-lettered: id=${parsed.id}, error=${err.message}`);
				}
			},
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify: 2 processed successfully, 1 sent to DLQ
		expect(processed.length).toBe(2);
		expect(processed[0].id).toBe(1);
		expect(processed[1].id).toBe(3);

		// Now consume from the DLQ topic to verify the failed message arrived
		const dlqConsumer = await connector.getConsumer({
			groupId: `test-dlq-reader-${Date.now()}`,
		});

		await dlqConsumer.subscribe({ topic: dlqTopic, fromBeginning: true });
		await dlqConsumer.run({
			eachMessage: async ({ message }) => {
				const parsed = JSON.parse(message.value?.toString() || '{}');
				deadLettered.push(parsed);
				log.info(`DLQ message: ${JSON.stringify(parsed)}`);
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify the DLQ has the failed message with error context
		expect(deadLettered.length).toBe(1);
		expect(deadLettered[0].original_message.id).toBe(2);
		expect(deadLettered[0].error).toBe('Cannot process message id=2');
		expect(deadLettered[0].source_topic).toBe(sourceTopic);

		// Clean up
		await consumer.disconnect();
		await dlqConsumer.disconnect();
		await producer.disconnect();
		await admin.deleteTopics({ topics: [sourceTopic, dlqTopic] });
	}, 25000);

	test('Error Handling - Manual Offset Commit', async () => {
		const testTopic = `test-manual-commit-${Date.now()}`;
		const committed: any[] = [];

		// Create topic
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// Produce messages
		const producer = await connector.getProducer();
		await producer.send({
			topic: testTopic,
			messages: [
				{ key: 'mc-1', value: JSON.stringify({ id: 1, data: 'first' }) },
				{ key: 'mc-2', value: JSON.stringify({ id: 2, data: 'second' }) },
				{ key: 'mc-3', value: JSON.stringify({ id: 3, data: 'third' }) },
			],
		});
		await producer.disconnect();

		// Consumer with autoCommit OFF — manually commit after processing
		const consumer = await connector.getConsumer({
			groupId: `test-manual-commit-group-${Date.now()}`,
		});

		await consumer.subscribe({ topic: testTopic, fromBeginning: true });
		await consumer.run({
			autoCommit: false,
			eachMessage: async ({ message, topic, partition, heartbeat }) => {
				const parsed = JSON.parse(message.value?.toString() || '{}');

				// Process the message
				committed.push(parsed);
				log.info(`Processing (manual commit): ${JSON.stringify(parsed)}`);

				// Manually commit the offset after successful processing
				await consumer.commitOffsets([{
					topic,
					partition,
					offset: (Number(message.offset) + 1).toString(),
				}]);

				// Send heartbeat to keep consumer alive during long processing
				await heartbeat();
			},
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		expect(committed.length).toBe(3);
		expect(committed[0].id).toBe(1);
		expect(committed[1].id).toBe(2);
		expect(committed[2].id).toBe(3);

		// Clean up
		await consumer.disconnect();
		await admin.deleteTopics({ topics: [testTopic] });
	}, 10000);

	test('Consumer - Batch Processing (eachBatch)', async () => {
		const testTopic = `test-batch-topic-${Date.now()}`;
		const batches: any[] = [];
		const allMessages: any[] = [];

		// Create topic
		await admin.createTopics({
			topics: [{ topic: testTopic, numPartitions: 1, replicationFactor: 1 }],
		});

		// Produce 5 messages
		const producer = await connector.getProducer();
		await producer.send({
			topic: testTopic,
			messages: Array.from({ length: 5 }, (_, i) => ({
				key: `batch-${i}`,
				value: JSON.stringify({ id: i + 1, data: `item-${i + 1}` }),
			})),
		});
		await producer.disconnect();

		// Consumer with eachBatch instead of eachMessage
		const consumer = await connector.getConsumer({
			groupId: `test-batch-group-${Date.now()}`,
		});

		await consumer.subscribe({ topic: testTopic, fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
				const batchInfo = {
					topic: batch.topic,
					partition: batch.partition,
					firstOffset: batch.firstOffset(),
					lastOffset: batch.lastOffset(),
					messageCount: batch.messages.length,
				};
				batches.push(batchInfo);
				log.info(`Batch received: ${JSON.stringify(batchInfo)}`);

				for (const message of batch.messages) {
					if (!isRunning() || isStale()) break;

					const parsed = JSON.parse(message.value?.toString() || '{}');
					allMessages.push(parsed);
					log.info(`Batch message: ${JSON.stringify(parsed)}`);

					resolveOffset(message.offset);
					await heartbeat();
				}
			},
		});

		// Wait for batch processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		expect(allMessages.length).toBe(5);
		expect(allMessages[0].id).toBe(1);
		expect(allMessages[4].id).toBe(5);
		expect(batches.length).toBeGreaterThanOrEqual(1);
		expect(batches[0].topic).toBe(testTopic);
		log.info(`Processed ${allMessages.length} messages in ${batches.length} batch(es)`);

		// Clean up
		await consumer.disconnect();
		await admin.deleteTopics({ topics: [testTopic] });
	}, 10000);
});
