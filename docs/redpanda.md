# Redpanda Connector

Kafka-compatible message streaming connector with producer, consumer, and admin operations.

**Driver:** KafkaJS  
**Peer dep:** `kafkajs ^2.2.4`

## Setup

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

// URL format (single or comma-separated brokers)
const rp = new RedpandaConnector({ url: 'localhost:9092' });
await rp.connect(); // mandatory — verifies via admin listTopics

// Brokers array format (with auth)
const rp = new RedpandaConnector({
  brokers: ['broker1:9092', 'broker2:9092'],
  clientId: 'my-service',
  connectionTimeout: 10000,  // ms (default)
  requestTimeout: 30000,     // ms (default)
  ssl: true,
  sasl: { mechanism: 'scram-sha-256', username: 'user', password: 'pass' },
});
await rp.connect();
```

### Advanced KafkaJS overrides

```typescript
const rp = new RedpandaConnector({
  brokers: ['localhost:9092'],
  kafka: { retry: { retries: 5 } },           // KafkaConfig
  producer: { idempotent: true },              // ProducerConfig
  consumer: { maxWaitTimeInMs: 5000 },         // ConsumerConfig
});
```

## Health Check

```typescript
const h = await rp.health(); // { ok: true } | { ok: false, error }
```

## Topic Management

```typescript
// Create
await rp.createTopic({
  topic: 'events',
  numPartitions: 3,
  replicationFactor: 1,
  configEntries: [{ name: 'retention.ms', value: '86400000' }], // 1 day
});

// List
const topics = await rp.listTopics();
if (topics.ok) console.log(topics.data); // string[]

// Metadata
const meta = await rp.fetchTopicMetadata(['events']);

// Delete
await rp.deleteTopic('events');
```

## Publishing

```typescript
// Basic
await rp.publish({
  topic: 'events',
  messages: [{ value: JSON.stringify({ type: 'signup', userId: 1 }) }],
});

// With key (determines partition)
await rp.publish({
  topic: 'events',
  messages: [{ key: 'user-1', value: JSON.stringify({ type: 'update' }) }],
});

// With headers
await rp.publish({
  topic: 'events',
  messages: [{
    key: 'user-1',
    value: JSON.stringify({ type: 'update' }),
    headers: { 'correlation-id': 'abc-123', 'event-type': 'user.updated' },
  }],
});

// Batch
await rp.publish({
  topic: 'events',
  messages: [
    { key: 'a', value: JSON.stringify({ n: 1 }) },
    { key: 'b', value: JSON.stringify({ n: 2 }) },
    { key: 'c', value: JSON.stringify({ n: 3 }) },
  ],
});
```

Result: `{ ok: true, data: RecordMetadata[] }` or `{ ok: false, error }`.

## Subscribing

```typescript
await rp.subscribe(
  {
    topics: ['events'],
    groupId: 'my-consumer-group',
    fromBeginning: true,
    autoCommit: true, // default
  },
  async (payload) => {
    const value = payload.message.value?.toString();
    console.log({
      topic: payload.topic,
      partition: payload.partition,
      offset: payload.message.offset,
      value: JSON.parse(value!),
    });
  },
);
```

### Multi-topic

```typescript
await rp.subscribe(
  { topics: ['events', 'notifications', 'analytics'], groupId: 'router' },
  async ({ topic, message }) => {
    const data = JSON.parse(message.value!.toString());
    switch (topic) {
      case 'events':        handleEvent(data); break;
      case 'notifications': handleNotif(data); break;
      case 'analytics':     handleAnalytics(data); break;
    }
  },
);
```

### Consumer groups (parallel processing)

```typescript
// Two instances with the same groupId share the workload
const worker1 = new RedpandaConnector({ url: 'localhost:9092' });
await worker1.connect();
await worker1.subscribe({ topics: ['tasks'], groupId: 'workers' }, handleTask);

const worker2 = new RedpandaConnector({ url: 'localhost:9092' });
await worker2.connect();
await worker2.subscribe({ topics: ['tasks'], groupId: 'workers' }, handleTask);
// Partitions are distributed between worker1 and worker2
```

### Unsubscribe

```typescript
await rp.unsubscribe(); // disconnects consumer only
```

## Patterns

### Event Sourcing

```typescript
// Publish domain events
await rp.publish({
  topic: 'user-events',
  messages: [{
    key: 'user-123',
    value: JSON.stringify({
      type: 'UserCreated',
      timestamp: Date.now(),
      data: { name: 'Alice', email: 'alice@co.com' },
    }),
  }],
});

// Rebuild state
await rp.subscribe(
  { topics: ['user-events'], groupId: 'state-builder', fromBeginning: true },
  async ({ message }) => {
    const event = JSON.parse(message.value!.toString());
    await applyEvent(event);
  },
);
```

### Dead Letter Queue

```typescript
await rp.subscribe(
  { topics: ['events'], groupId: 'processor' },
  async (payload) => {
    try {
      await processMessage(payload.message);
    } catch (error) {
      await rp.publish({
        topic: 'events-dlq',
        messages: [{
          key: payload.message.key?.toString(),
          value: payload.message.value!.toString(),
          headers: {
            error: (error as Error).message,
            'original-topic': payload.topic,
            'failed-at': Date.now().toString(),
          },
        }],
      });
    }
  },
);
```

## Close

```typescript
await rp.unsubscribe(); // consumer only
await rp.close();       // disconnects producer + consumer + admin in parallel
```

## Underlying Instances

```typescript
rp.getInstance();          // Kafka (KafkaJS client)
rp.getAdminInstance();     // Admin | null
rp.getProducerInstance();  // Producer | null
rp.getConsumerInstance();  // Consumer | null
```

Sub-clients (admin, producer, consumer) are created lazily on first use.

## Full API

| Method | Returns |
|--------|---------|
| `connect()` | `Promise<void>` |
| `health()` / `ping()` | `{ ok }` or `{ ok, error }` |
| `createTopic(config)` | `{ ok }` or `{ ok, error }` |
| `listTopics()` | `{ ok, data: string[] }` |
| `deleteTopic(name)` | `{ ok }` or `{ ok, error }` |
| `fetchTopicMetadata(topics?)` | `{ ok, data }` |
| `publish(message)` | `{ ok, data }` or `{ ok, error }` |
| `subscribe(config, handler)` | `{ ok, data: Consumer }` |
| `unsubscribe()` | `Promise<void>` |
| `close()` | `Promise<void>` |
| `getInstance()` | `Kafka` |
| `getAdminInstance()` | `Admin \| null` |
| `getProducerInstance()` | `Producer \| null` |
| `getConsumerInstance()` | `Consumer \| null` |
