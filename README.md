# @rniverse/connectors

Production-ready TypeScript connectors for **PostgreSQL** (Drizzle ORM), **Redis**, **MongoDB**, and **Redpanda** (Kafka). Built for [Bun](https://bun.sh).

> **Runtime:** Bun ≥ 1.x (uses `bun:SQL` and `bun:RedisClient` native APIs)

## Install

```bash
bun add @rniverse/connectors
```

### Peer dependencies

```jsonc
{
  "@rniverse/utils": "github:rniverse/utils#dist",
  "drizzle-orm": "^0.44.7",  // SQL only
  "kafkajs": "^2.2.4",       // Redpanda only
  "mongodb": "^6.20.0"       // MongoDB only
}
```

## Lifecycle

Every connector follows the same pattern:

```
new Connector(config) → await connector.connect() → use → await connector.close()
```

`connect()` is **mandatory** before any operation — calling methods without it throws.

## Quick Start

### SQL (PostgreSQL + Drizzle ORM)

```typescript
import { SQLConnector } from '@rniverse/connectors';
import { eq } from 'drizzle-orm';

const sql = new SQLConnector({ url: 'postgres://user:pass@localhost:5432/mydb' });
await sql.connect();

const orm = sql.getInstance();
const users = await orm.select().from(usersTable).where(eq(usersTable.age, 30));

// Raw SQL via Bun's tagged template
const rows = await orm.$client`SELECT * FROM users WHERE age > ${25}`;

await sql.close();
```

### Redis

```typescript
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({ url: 'redis://localhost:6379' });
await redis.connect();

const client = redis.getInstance();
await client.set('key', 'value');
const value = await client.get('key');

await redis.close();
```

### MongoDB

```typescript
import { MongoDBConnector } from '@rniverse/connectors';

interface User { name: string; email: string; age: number }

const mongo = new MongoDBConnector({ url: 'mongodb://localhost:27017', database: 'mydb' });
await mongo.connect();

const db = mongo.getInstance();
await db.collection<User>('users').insertOne({ name: 'Alice', email: 'alice@example.com', age: 28 });
const result = await db.collection<User>('users').find({ age: { $gte: 25 } }).toArray();
console.log(result);

await mongo.close();
```

### Redpanda (Kafka)

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

const rp = new RedpandaConnector({ url: 'localhost:9092' });
await rp.connect();

const producer = await rp.getProducer();
await producer.send({ topic: 'events', messages: [{ value: JSON.stringify({ event: 'signup' }) }] });
await producer.disconnect();

const consumer = await rp.getConsumer({ groupId: 'my-group' });
await consumer.subscribe({ topics: ['events'], fromBeginning: true });
await consumer.run({
  eachMessage: async (payload) => console.log(payload.message.value?.toString())
});
// Close consumer manually when done: await consumer.disconnect();

await rp.close();
```

## Health Checks

All connectors expose `health()` returning `{ ok: true }` or `{ ok: false, error }`:

```typescript
const h = await mongo.health();
if (!h.ok) log.error({ error: h.error }, 'MongoDB down');
```

## Result Pattern

Some operations return a discriminated union `{ ok: true, data } | { ok: false, error }`, but most Native drivers now throw errors normally. Use `try/catch` or check `health()` results:

```typescript
const h = await mongo.health();
if (!h.ok) {
  // h.error contains details
}
```

## Project Structure

```
lib/
├── core/     # Connector classes (MongoDB, Redis, Redpanda, SQL)
├── tools/    # Low-level factory functions (initMongoDB, initRedis, initORM, initRedpanda)
└── types/    # Config type definitions
```

## Detailed Docs

| Connector | Guide |
|-----------|-------|
| MongoDB   | [docs/mongodb.md](docs/mongodb.md) |
| Redis     | [docs/redis.md](docs/redis.md) |
| Redpanda  | [docs/redpanda.md](docs/redpanda.md) |
| SQL       | [docs/sql.md](docs/sql.md) |

Full reference with configuration, all methods, patterns, and troubleshooting: **[docs/README.md](docs/README.md)**
