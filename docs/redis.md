# Redis Connector Guide

High-performance Redis client using Bun's native Redis implementation.

## Configuration

```typescript
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({
  url: 'redis://localhost:6379'
});
```

## Basic Usage

```typescript
// Health check
const health = await redis.health();

// Get client
const client = redis.getInstance();
```

## String Operations

```typescript
// SET and GET
await client.set('key', 'value');
const value = await client.get('key');

// INCR and DECR
await client.incr('counter');
await client.decr('counter');

// With expiration
await client.send('SET', ['key', 'value', 'EX', '60']); // 60 seconds
```

## Hash Operations

```typescript
// HSET and HGET
await client.hset('user:1', 'name', 'John');
const name = await client.hget('user:1', 'name');

// HGETALL
const user = await client.send('HGETALL', ['user:1']);
```

## List Operations

```typescript
await client.send('LPUSH', ['queue', 'item1']);
await client.send('RPUSH', ['queue', 'item2']);
const items = await client.send('LRANGE', ['queue', '0', '-1']);
```

## Set Operations

```typescript
await client.sadd('tags', 'javascript', 'typescript');
const members = await client.smembers('tags');
const isMember = await client.sismember('tags', 'javascript');
```

## Sorted Set Operations

```typescript
await client.send('ZADD', ['leaderboard', '100', 'user1', '200', 'user2']);
const top10 = await client.send('ZREVRANGE', ['leaderboard', '0', '9', 'WITHSCORES']);
```

## Pub/Sub

```typescript
// Publisher
const publisher = new RedisConnector({ url: 'redis://localhost:6379' });
await publisher.getInstance().publish('channel', 'message');

// Subscriber
const subscriber = new RedisConnector({ url: 'redis://localhost:6379' });
const subClient = await subscriber.getInstance().duplicate();
await subClient.subscribe('channel', (message) => {
  console.log('Received:', message);
});
```

## Cursor Operations (SCAN)

```typescript
let cursor = 0;
const allKeys: string[] = [];

do {
  const result = await client.send('SCAN', [
    cursor.toString(),
    'MATCH', 'user:*',
    'COUNT', '100'
  ]);
  cursor = Number(result[0]);
  allKeys.push(...(result[1] as string[]));
} while (cursor !== 0);
```

## Advanced Operations

See [test file](../lib/test/redis.test.ts) for examples of:
- TTL and expiration
- HSCAN, SSCAN, ZSCAN (cursor-based scanning)
- Batch operations (MGET, MSET)
- Set operations (SINTER, SUNION, SDIFF)

## References

- [Redis Documentation](https://redis.io/documentation)
- [Test Examples](../lib/test/redis.test.ts)
