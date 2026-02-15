# @rniverse/connectors — Full Reference

Production-ready TypeScript connectors for PostgreSQL (Drizzle ORM), Redis, MongoDB, and Redpanda (Kafka).  
**Runtime:** Bun ≥ 1.x (uses `bun:SQL` and `bun:RedisClient` native APIs).

## Table of Contents

- [Install](#install)
- [Lifecycle](#lifecycle)
- [SQL Connector](#sql-connector)
- [Redis Connector](#redis-connector)
- [MongoDB Connector](#mongodb-connector)
- [Redpanda Connector](#redpanda-connector)
- [Low-Level Tools](#low-level-tools)
- [Configuration Reference](#configuration-reference)
- [Error Handling](#error-handling)
- [Graceful Shutdown](#graceful-shutdown)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Install

```bash
bun add @rniverse/connectors
```

Peer dependencies — add only what you need:

```jsonc
{
  "@rniverse/utils": "github:rniverse/utils#dist",  // always required (logging)
  "drizzle-orm": "^0.44.7",   // SQL
  "kafkajs": "^2.2.4",        // Redpanda
  "mongodb": "^6.20.0"        // MongoDB
}
```

---

## Lifecycle

All four connectors share the same lifecycle contract:

```
new Connector(config)   // 1. Construct (no I/O)
await connector.connect()  // 2. Connect + verify
// … use …
await connector.close()    // 3. Tear down
```

- `connect()` is **mandatory** — operations throw `"not connected — call connect() first"` without it.
- `connect()` is **idempotent** — safe to call multiple times.
- `health()` returns `{ ok: true }` or `{ ok: false, error }` — use for readiness probes.
- `close()` releases connections and resets state — the instance can be reconnected after.

---

## SQL Connector

**Driver:** `bun:SQL` + Drizzle ORM  
**Detailed guide:** [sql.md](./sql.md)

```typescript
import { SQLConnector } from '@rniverse/connectors';
import { eq, desc } from 'drizzle-orm';

const sql = new SQLConnector({ url: 'postgres://user:pass@localhost:5432/mydb' });
await sql.connect();

const orm = sql.getInstance(); // Drizzle ORM instance

// Type-safe queries
const users = await orm.select().from(usersTable).where(eq(usersTable.age, 30));
const recent = await orm.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(10);

// Inserts
const [user] = await orm.insert(usersTable).values({ name: 'Alice', email: 'a@b.com' }).returning();

// Raw SQL via Bun tagged template
const rows = await orm.$client`SELECT count(*) FROM users WHERE age > ${25}`;

await sql.close();
```

### Host-based config

```typescript
const sql = new SQLConnector({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
  max: 20,             // pool size
  idleTimeout: 30,     // seconds
});
```

### Drizzle Kit (migrations)

Schema generation, migrations, introspection, and visual studio via CLI:

```bash
bun run db:generate --config=lib/migrations/myapp.config.ts   # generate SQL from schema
bun run db:migrate  --config=lib/migrations/myapp.config.ts   # apply pending migrations
bun run db:push     --config=lib/migrations/myapp.config.ts   # push schema directly
bun run db:introspect --config=lib/migrations/myapp.config.ts # pull DB → Drizzle schema
bun run db:studio   --config=lib/migrations/myapp.config.ts   # visual DB browser
```

See [sql.md — Drizzle Kit](./sql.md#drizzle-kit-migrations--schema-management) for full setup, config format, and multi-database workflow.

---

## Redis Connector

**Driver:** `bun:RedisClient` (native)  
**Detailed guide:** [redis.md](./redis.md)

```typescript
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({ url: 'redis://localhost:6379' });
await redis.connect();

const client = redis.getInstance(); // Bun RedisClient

// Strings
await client.set('key', 'value');
const val = await client.get('key');

// Hashes
await client.hset('user:1', 'name', 'John');
const name = await client.hget('user:1', 'name');

// Sets
await client.sadd('tags', 'ts', 'bun');
const members = await client.smembers('tags');

// Commands via send()
await client.send('EXPIRE', ['key', '60']);
const ttl = await client.send('TTL', ['key']);

await redis.close();
```

---

## MongoDB Connector

**Driver:** Official `mongodb` driver  
**Detailed guide:** [mongodb.md](./mongodb.md)

```typescript
import { MongoDBConnector } from '@rniverse/connectors';

interface User { name: string; email: string; age: number }

const mongo = new MongoDBConnector({ url: 'mongodb://localhost:27017', database: 'mydb' });
await mongo.connect();

// Insert
await mongo.insertOne<User>('users', { name: 'Alice', email: 'alice@co.com', age: 28 });

// Find
const result = await mongo.find<User>('users', { age: { $gte: 25 } });
if (result.ok) console.log(result.data); // User[]

// Update
await mongo.updateOne<User>('users', { email: 'alice@co.com' }, { $set: { age: 29 } });

// Delete
await mongo.deleteMany<User>('users', { age: { $lt: 18 } });

// Aggregation
const agg = await mongo.aggregate<User>('users', [
  { $group: { _id: null, avgAge: { $avg: '$age' } } },
]);

// Cross-database access
const other = mongo.getCollection<User>('users', { db: 'other_db' });

await mongo.close();
```

### Result pattern

Every MongoDB CRUD method returns `{ ok: true, data }` or `{ ok: false, error }`:

```typescript
const r = await mongo.findOne<User>('users', { email });
if (r.ok) {
  // r.data: User | null
} else {
  // r.error: caught exception
}
```

---

## Redpanda Connector

**Driver:** KafkaJS (Kafka-compatible)  
**Detailed guide:** [redpanda.md](./redpanda.md)

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

const rp = new RedpandaConnector({ url: 'localhost:9092' });
await rp.connect();

// Topic management
await rp.createTopic({ topic: 'events', numPartitions: 3 });
const topics = await rp.listTopics();

// Publish
await rp.publish({
  topic: 'events',
  messages: [
    { key: 'user-1', value: JSON.stringify({ type: 'signup', ts: Date.now() }) },
  ],
});

// Subscribe
await rp.subscribe(
  { topics: ['events'], groupId: 'worker', fromBeginning: true },
  async (payload) => {
    const event = JSON.parse(payload.message.value!.toString());
    console.log(event);
  },
);

// Cleanup
await rp.unsubscribe(); // stops consumer only
await rp.close();       // disconnects producer + consumer + admin
```

### Brokers array config

```typescript
const rp = new RedpandaConnector({
  brokers: ['broker1:9092', 'broker2:9092'],
  clientId: 'my-service',
  ssl: true,
  sasl: { mechanism: 'scram-sha-256', username: 'user', password: 'pass' },
});
```

---

## Low-Level Tools

Factory functions used internally by the connectors. Useful when you need the raw client without the connector wrapper.

| Function | Returns | Used by |
|----------|---------|---------|
| `initMongoDB(config)` | `Promise<{ client: MongoClient, db: Db }>` | `MongoDBConnector` |
| `initRedis(config)` | `RedisClient` | `RedisConnector` |
| `initORM(config)` | `BunSQLDrizzle` | `SQLConnector` |
| `initRedpanda(config)` | `Kafka` | `RedpandaConnector` |
| `closeMongoDB(client)` | `Promise<void>` | `MongoDBConnector.close()` |

```typescript
import { initMongoDB, initRedis, initORM, initRedpanda } from '@rniverse/connectors';
```

---

## Configuration Reference

### SQL — `SQLConnectorConfig`

```typescript
// URL-based
{ url: string } & Partial<SQLConnectorOptionsConfig>

// Host-based
{ host: string; port: number; database: string; user: string; password: string }
  & Partial<SQLConnectorOptionsConfig>

// Pool options (defaults)
{
  max: 20,               // pool size
  idleTimeout: 30,       // seconds
  maxLifetime: 3600,     // seconds
  connectionTimeout: 30, // seconds
  prepare: true,         // prepared statements
}
```

### Redis — `RedisConnectorConfig`

```typescript
{
  url: string;                    // e.g. 'redis://localhost:6379'
  connectionTimeout?: number;     // ms (default: 10000)
  idleTimeout?: number;           // ms (default: 30000)
  autoReconnect?: boolean;        // default: true
  maxRetries?: number;            // default: 10
  enableOfflineQueue?: boolean;   // default: true
  enableAutoPipelining?: boolean; // default: true
  tls?: boolean | { rejectUnauthorized?: boolean; ca?: string; cert?: string; key?: string };
}
```

### MongoDB — `MongoDBConnectorConfig`

```typescript
{
  url: string;           // e.g. 'mongodb://localhost:27017'
  database?: string;     // optional if included in URL
  options?: {
    maxPoolSize?: number;              // default: 10
    minPoolSize?: number;              // default: 2
    connectTimeoutMS?: number;         // default: 10000
    socketTimeoutMS?: number;          // default: 45000
    serverSelectionTimeoutMS?: number; // default: 10000
    retryWrites?: boolean;            // default: true
    retryReads?: boolean;             // default: true
    appName?: string;
  };
}
```

### Redpanda — `RedpandaConnectorConfig`

```typescript
// URL format
{ url: string; clientId?: string; connectionTimeout?: number; requestTimeout?: number }

// Brokers format
{
  brokers: string[];
  clientId?: string;                // default: 'redpanda-connector'
  connectionTimeout?: number;       // ms (default: 10000)
  requestTimeout?: number;          // ms (default: 30000)
  ssl?: boolean | TlsConfig;
  sasl?: { mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'; username: string; password: string };
  kafka?: Partial<KafkaConfig>;     // KafkaJS overrides
  producer?: Partial<ProducerConfig>;
  consumer?: Partial<ConsumerConfig>;
  admin?: Partial<AdminConfig>;
}
```

---

## Error Handling

### MongoDB (result union)

```typescript
const r = await mongo.findOne<User>('users', { email });
if (!r.ok) {
  log.error({ error: r.error }, 'lookup failed');
  return;
}
// r.data is safely typed here
```

### Other connectors (standard throw)

Redis, SQL, and Redpanda operations throw on failure — wrap in try/catch:

```typescript
try {
  await client.set('key', 'value');
} catch (err) {
  log.error({ error: err }, 'redis set failed');
}
```

Redpanda's topic/publish/subscribe methods return `{ ok, data/error }` like MongoDB.

### connect() failures

All connectors throw from `connect()` on failure. MongoDB resets its init promise so a retry is possible:

```typescript
try {
  await mongo.connect();
} catch {
  // retry after delay
  await Bun.sleep(5000);
  await mongo.connect(); // re-attempts connection
}
```

---

## Graceful Shutdown

```typescript
const shutdown = async () => {
  await Promise.allSettled([
    sql.close(),
    redis.close(),
    mongo.close(),
    rp.close(),
  ]);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## Testing

### Prerequisites

```bash
# PostgreSQL
docker run -d -p 5432:5432 --name pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=testdb postgres:15

# Redis
docker run -d -p 6379:6379 --name redis redis:7

# MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7

# Redpanda
docker run -d -p 9092:9092 --name redpanda vectorized/redpanda:latest \
  redpanda start --smp 1 --memory 1G --overprovisioned \
  --kafka-addr 0.0.0.0:9092 --advertise-kafka-addr localhost:9092
```

### Run

```bash
bun test                             # all tests
bun test lib/test/sql.test.ts        # SQL raw
bun test lib/test/sql-drizzle.test.ts # SQL Drizzle
bun test lib/test/redis.test.ts      # Redis
bun test lib/test/mongodb.test.ts    # MongoDB
bun test lib/test/redpanda.test.ts   # Redpanda
```

### Environment variables

```bash
POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/testdb
REDIS_URL=redis://localhost:6379
MONGODB_TEST_URL=mongodb://localhost:27017/testdb
REDPANDA_URL=localhost:9092
```

---

## Troubleshooting

### "not connected — call connect() first"

You called an operation before `await connector.connect()`. Every connector requires an explicit connect step.

### SQL timeouts

Increase `connectionTimeout` (seconds):

```typescript
new SQLConnector({ url: '...', connectionTimeout: 60 });
```

### Redis won't reconnect

Check `autoReconnect` and `maxRetries`:

```typescript
new RedisConnector({ url: '...', autoReconnect: true, maxRetries: 20 });
```

### MongoDB server selection timeout

The default is 10 s. Increase for slow networks:

```typescript
new MongoDBConnector({ url: '...', options: { serverSelectionTimeoutMS: 30000 } });
```

### Redpanda consumer not receiving

- Verify the topic exists: `await rp.listTopics()`
- Check `fromBeginning: true` if you need historical messages
- Ensure `groupId` is unique per logical consumer group

---

## Connector Guides

| Connector | Guide | Features |
|-----------|-------|----------|
| SQL       | [sql.md](./sql.md) | Drizzle ORM, raw SQL, pooling, transactions, joins, CTEs, window functions |
| Redis     | [redis.md](./redis.md) | All data types, Pub/Sub, SCAN, TTL, pipelining |
| MongoDB   | [mongodb.md](./mongodb.md) | Typed CRUD, aggregation, indexes, multi-database, cursors |
| Redpanda  | [redpanda.md](./redpanda.md) | Topics, producer, consumer groups, headers, DLQ patterns |
