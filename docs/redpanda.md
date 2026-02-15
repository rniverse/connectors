# Redpanda Connector Guide

Kafka-compatible message streaming connector using KafkaJS.

## Configuration

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

const redpanda = new RedpandaConnector({
  url: 'localhost:9092'
});
```

## Basic Usage

```typescript
// Health check
const health = await redpanda.health();
```

## Topic Management

```typescript
// Create topic
const result = await redpanda.createTopic({
  topic: 'my-topic',
  numPartitions: 3,
  replicationFactor: 1
});

// List topics
const topics = await redpanda.listTopics();

// Delete topic
await redpanda.deleteTopic('my-topic');

// Get metadata
const metadata = await redpanda.fetchTopicMetadata(['my-topic']);
```

## Publishing Messages

```typescript
// Basic publish
await redpanda.publish({
  topic: 'events',
  messages: [
    { value: JSON.stringify({ event: 'user.created', userId: 123 }) }
  ]
});

// With key
await redpanda.publish({
  topic: 'events',
  messages: [
    {
      key: 'user-123',
      value: JSON.stringify({ event: 'user.updated' })
    }
  ]
});

// With headers
await redpanda.publish({
  topic: 'events',
  messages: [
    {
      key: 'user-123',
      value: JSON.stringify({ event: 'user.updated' }),
      headers: {
        'correlation-id': 'abc-123',
        'event-type': 'user.updated'
      }
    }
  ]
});

// Batch publish
await redpanda.publish({
  topic: 'events',
  messages: [
    { key: 'msg1', value: JSON.stringify({ data: 'Message 1' }) },
    { key: 'msg2', value: JSON.stringify({ data: 'Message 2' }) },
    { key: 'msg3', value: JSON.stringify({ data: 'Message 3' }) }
  ]
});
```

## Consuming Messages

```typescript
// Basic consumer
await redpanda.subscribe(
  {
    topics: ['events'],
    groupId: 'my-consumer-group',
    fromBeginning: true
  },
  async (payload) => {
    const message = payload.message;
    const value = message.value?.toString();
    
    console.log('Received:', JSON.parse(value));
    console.log('Partition:', payload.partition);
    console.log('Offset:', message.offset);
  }
);

// Multi-topic subscription
await redpanda.subscribe(
  {
    topics: ['events', 'notifications', 'analytics'],
    groupId: 'multi-topic-consumer',
    fromBeginning: true
  },
  async (payload) => {
    switch (payload.topic) {
      case 'events':
        await handleEvent(payload.message);
        break;
      case 'notifications':
        await handleNotification(payload.message);
        break;
      case 'analytics':
        await handleAnalytics(payload.message);
        break;
    }
  }
);
```

## Consumer Groups

```typescript
// Multiple consumers with same group ID share the workload
const consumer1 = new RedpandaConnector({ url: 'localhost:9092' });
await consumer1.subscribe(
  { topics: ['events'], groupId: 'processors', fromBeginning: true },
  handleMessage
);

const consumer2 = new RedpandaConnector({ url: 'localhost:9092' });
await consumer2.subscribe(
  { topics: ['events'], groupId: 'processors', fromBeginning: true },
  handleMessage
);
// Messages are distributed between consumer1 and consumer2
```

## Unsubscribe

```typescript
await redpanda.unsubscribe();
```

## Message Patterns

### Event Sourcing

```typescript
// Publish events
await redpanda.publish({
  topic: 'user-events',
  messages: [
    {
      key: 'user-123',
      value: JSON.stringify({
        type: 'UserCreated',
        userId: 123,
        timestamp: Date.now(),
        data: { username: 'john', email: 'john@example.com' }
      })
    }
  ]
});

// Rebuild state from events
await redpanda.subscribe(
  { topics: ['user-events'], groupId: 'state-builder', fromBeginning: true },
  async (payload) => {
    const event = JSON.parse(payload.message.value?.toString());
    await applyEvent(event);
  }
);
```

### Dead Letter Queue

```typescript
await redpanda.subscribe(
  { topics: ['events'], groupId: 'processor' },
  async (payload) => {
    try {
      await processMessage(payload.message);
    } catch (error) {
      // Send to DLQ
      await redpanda.publish({
        topic: 'events-dlq',
        messages: [{
          key: payload.message.key?.toString(),
          value: payload.message.value,
          headers: {
            'error': error.message,
            'original-topic': payload.topic,
            'failed-at': Date.now().toString()
          }
        }]
      });
    }
  }
);
```

## Advanced Features

See [test file](../lib/test/redpanda.test.ts) for examples of:
- Topic metadata
- Message headers
- Partitioning strategies
- Consumer group coordination
- Offset management

## References

- [Redpanda Documentation](https://docs.redpanda.com/)
- [KafkaJS Documentation](https://kafka.js.org/)
- [Test Examples](../lib/test/redpanda.test.ts)
