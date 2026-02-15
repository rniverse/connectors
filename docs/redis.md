# Redis Connector

Thin wrapper around Bun's native `RedisClient` with connection lifecycle, health checks, and auto-reconnect.

**Driver:** `bun:RedisClient` (native, zero dependencies)

## Setup

```typescript
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({
  url: 'redis://localhost:6379',
  connectionTimeout: 10000,      // ms (default)
  idleTimeout: 30000,            // ms (default)
  autoReconnect: true,           // default
  maxRetries: 10,                // default
  enableOfflineQueue: true,      // default
  enableAutoPipelining: true,    // default
});

await redis.connect(); // mandatory — verifies via PING
```

### TLS

```typescript
const redis = new RedisConnector({
  url: 'rediss://my-host:6380',
  tls: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca.pem', 'utf8'),
  },
});
```

## Health Check

```typescript
const h = await redis.health(); // { ok: true, data: 'PONG' } | { ok: false, error }
```

## Usage

After `connect()`, get the Bun `RedisClient` and use it directly:

```typescript
const client = redis.getInstance();
```

### Strings

```typescript
await client.set('key', 'value');
const val = await client.get('key'); // string | null

await client.incr('counter');
await client.decr('counter');
```

### With Expiration

```typescript
await client.send('SET', ['key', 'value', 'EX', '60']); // 60 seconds TTL
await client.send('EXPIRE', ['key', '120']);
const ttl = await client.send('TTL', ['key']); // number
```

### Hashes

```typescript
await client.hset('user:1', 'name', 'Alice');
await client.hset('user:1', 'age', '28');

const name = await client.hget('user:1', 'name');      // 'Alice'
const all  = await client.send('HGETALL', ['user:1']);  // ['name','Alice','age','28']
```

### Lists

```typescript
await client.send('LPUSH', ['queue', 'job-1']);
await client.send('RPUSH', ['queue', 'job-2']);
const items = await client.send('LRANGE', ['queue', '0', '-1']); // ['job-1','job-2']
const job   = await client.send('LPOP', ['queue']);               // 'job-1'
```

### Sets

```typescript
await client.sadd('tags', 'ts', 'bun', 'redis');
const members  = await client.smembers('tags');
const isMember = await client.sismember('tags', 'ts'); // 1 | 0
```

### Sorted Sets

```typescript
await client.send('ZADD', ['leaderboard', '100', 'alice', '200', 'bob']);
const top = await client.send('ZREVRANGE', ['leaderboard', '0', '9', 'WITHSCORES']);
const rank = await client.send('ZRANK', ['leaderboard', 'alice']); // 0-based
```

### Batch Operations

```typescript
await client.send('MSET', ['k1', 'v1', 'k2', 'v2', 'k3', 'v3']);
const vals = await client.send('MGET', ['k1', 'k2', 'k3']); // ['v1','v2','v3']
```

## Pub/Sub

Bun's RedisClient requires a **separate connection** for subscriptions:

```typescript
// Publisher
const pub = new RedisConnector({ url: 'redis://localhost:6379' });
await pub.connect();

// Subscriber (dedicated connection)
const sub = new RedisConnector({ url: 'redis://localhost:6379' });
await sub.connect();
const subClient = await sub.getInstance().duplicate();

await subClient.subscribe('notifications', (message) => {
  console.log('Received:', message);
});

await pub.getInstance().publish('notifications', 'hello');

// Cleanup
await pub.close();
await sub.close();
```

## SCAN (Cursor Iteration)

Use SCAN instead of KEYS in production:

```typescript
let cursor = 0;
const keys: string[] = [];

do {
  const result = await client.send('SCAN', [cursor.toString(), 'MATCH', 'user:*', 'COUNT', '100']);
  cursor = Number(result[0]);
  keys.push(...(result[1] as string[]));
} while (cursor !== 0);
```

Variants: `HSCAN`, `SSCAN`, `ZSCAN` for hashes, sets, sorted sets.

## Close

```typescript
await redis.close(); // calls client.close() and resets internal state
```

## Full API

| Method | Returns |
|--------|---------|
| `connect()` | `Promise<void>` |
| `health()` / `ping()` | `{ ok, data/error }` |
| `getInstance()` | `RedisClient` |
| `close()` | `Promise<void>` |

All Redis operations go through `getInstance()` — the connector is intentionally thin.
