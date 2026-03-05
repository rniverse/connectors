# Redpanda Connector

Kafka-compatible message streaming connector wrapper. It manages the underlying connection and provides access to native KafkaJS Admin, Producer, and Consumer clients.

**Driver:** KafkaJS  
**Peer dep:** `kafkajs ^2.2.4`

## Setup

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

// URL format (single or comma-separated brokers)
const rp = new RedpandaConnector({ url: 'localhost:9092' });
const admin = await rp.connect(); // mandatory — verifies connection via admin.listTopics()

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
});
```

## Health Check

```typescript
const h = await rp.health(); // { ok: true } | { ok: false, error }
```

## Topic Management (Admin)

After connecting, you can get the cached `Admin` client.

```typescript
const admin = await rp.getAdmin();

// Create
await admin.createTopics({
  topics: [{ 
    topic: 'events', 
    numPartitions: 3, 
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '86400000' }] // 1 day
  }],
});

// List
const topics = await admin.listTopics();
console.log(topics);

// Delete
await admin.deleteTopics({ topics: ['events'] });
```

## Publishing (Producer)

Request a producer instance. **You are responsible for disconnecting it** when done (or when shutting down).

```typescript
const producer = await rp.getProducer(); // Optionally passing ProducerConfig

// Basic
await producer.send({
  topic: 'events',
  messages: [{ value: JSON.stringify({ type: 'signup', userId: 1 }) }],
});

// With key (determines partition) & headers
await producer.send({
  topic: 'events',
  messages: [{
    key: 'user-1',
    value: JSON.stringify({ type: 'update' }),
    headers: { 'correlation-id': 'abc-123', 'event-type': 'user.updated' },
  }],
});

// Batch
await producer.send({
  topic: 'events',
  messages: [
    { key: 'a', value: JSON.stringify({ n: 1 }) },
    { key: 'b', value: JSON.stringify({ n: 2 }) },
    { key: 'c', value: JSON.stringify({ n: 3 }) },
  ],
});

await producer.disconnect();
```

## Subscribing (Consumer)

Request a consumer instance with a `groupId`. **You are responsible for disconnecting it** when shutting down.

### Single Message Processing

```typescript
const consumer = await rp.getConsumer({ groupId: 'my-consumer-group' });

await consumer.subscribe({ topics: ['events', 'notifications'], fromBeginning: true });

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const value = message.value?.toString();
    console.log({
      topic,
      partition,
      offset: message.offset,
      value: JSON.parse(value!),
    });
  },
});

// Later, on shutdown:
// await consumer.disconnect();
```

### Batch Processing (High Throughput)

```typescript
const consumer = await rp.getConsumer({ groupId: 'batch-group' });
await consumer.subscribe({ topics: ['events'], fromBeginning: true });

await consumer.run({
  eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
    console.log(`Received batch of ${batch.messages.length} messages`);
    
    for (const message of batch.messages) {
      if (!isRunning() || isStale()) break;
      
      await processMessage(message);
      
      resolveOffset(message.offset);
      await heartbeat(); // keep consumer alive during long processing
    }
  },
});
```

## Patterns

### Dead Letter Queue (DLQ)

```typescript
const producer = await rp.getProducer();
const consumer = await rp.getConsumer({ groupId: 'processor' });

await consumer.subscribe({ topic: 'events', fromBeginning: true });
await consumer.run({
  eachMessage: async ({ message, topic, partition }) => {
    try {
      await processMessage(message);
    } catch (err: any) {
      // Forward to DLQ instead of crashing or endlessly retrying
      await producer.send({
        topic: 'events-dlq',
        messages: [{
          key: message.key?.toString(),
          value: JSON.stringify({
            original_message: JSON.parse(message.value?.toString() || '{}'),
            error: err.message,
            source_topic: topic,
            source_partition: partition,
            source_offset: message.offset,
          }),
        }],
      });
    }
  },
});
```

### Manual Offset Commit (At-least-once Semantics)

```typescript
await consumer.run({
  autoCommit: false, // Turn off automatic commits
  eachMessage: async ({ message, topic, partition, heartbeat }) => {
    // 1. Process
    await processMessage(message);
    
    // 2. Commit explicitly after success
    await consumer.commitOffsets([{
      topic,
      partition,
      offset: (Number(message.offset) + 1).toString(),
    }]);
    
    await heartbeat();
  },
});
```

## Close

```typescript
await rp.close(); // Disconnects the cached Admin client
// Note: Producers and Consumers created via getProducer()/getConsumer() 
// must be disconnected manually!
```

## Full API

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<Admin>` | Initializes connection and verifies via Admin API |
| `health()` / `ping()` | `{ ok: boolean, error?: any }` | Performs Admin API check |
| `getAdmin()` | `Promise<Admin>` | Returns the cached KafkaJS Admin client |
| `getProducer(config?)` | `Promise<Producer>` | Creates and connects a new KafkaJS Producer |
| `getConsumer(config)` | `Promise<Consumer>` | Creates and connects a new KafkaJS Consumer |
| `getInstance()` | `Kafka` | Returns the raw KafkaJS client instance |
| `close()` | `Promise<void>` | Disconnects the cached Admin client |
