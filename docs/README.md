# @rniverse/connectors

A comprehensive TypeScript connector library for database and messaging systems, providing type-safe, production-ready clients for SQL (PostgreSQL with Drizzle ORM), Redis, MongoDB, and Redpanda (Kafka).

## Table of Contents

- [Installation](#installation)
- [Available Connectors](#available-connectors)
- [SQL Connector](#sql-connector)
- [Redis Connector](#redis-connector)
- [MongoDB Connector](#mongodb-connector)
- [Redpanda Connector](#redpanda-connector)
- [Configuration](#configuration)
- [Testing](#testing)

## Installation

```bash
bun install
```

### Dependencies

Add these to your root project's `package.json`:

```json
{
  "dependencies": {
    "@rniverse/utils": "github:rniverse/utils#dist",
    "drizzle-orm": "^0.44.7",
    "kafkajs": "^2.2.4",
    "mongodb": "^6.20.0"
  }
}
```

---

## Available Connectors

### 1. SQL Connector (PostgreSQL with Drizzle ORM)
- **Driver**: Bun's native SQL driver with Drizzle ORM
- **Features**: Connection pooling, type-safe queries, transactions, raw SQL support
- **Documentation**: [SQL Connector Guide](./sql.md)
- **Tests**: `bun test lib/test/sql.test.ts lib/test/sql-drizzle.test.ts`

### 2. Redis Connector
- **Driver**: Bun's native Redis client
- **Features**: All Redis data types, Pub/Sub, connection health checks, cursor operations
- **Documentation**: [Redis Connector Guide](./redis.md)
- **Tests**: `bun test lib/test/redis.test.ts`

### 3. MongoDB Connector
- **Driver**: Official MongoDB Node.js driver
- **Features**: Type-safe CRUD, aggregation pipelines, index management, multi-database support
- **Documentation**: [MongoDB Connector Guide](./mongodb.md)
- **Tests**: `bun test lib/test/mongodb.test.ts`
- **Requirements**: MongoDB server must be running

### 4. Redpanda Connector (Kafka-compatible)
- **Driver**: KafkaJS
- **Features**: Producer/consumer, topic management, multi-topic subscriptions
- **Documentation**: [Redpanda Connector Guide](./redpanda.md)
- **Tests**: `bun test lib/test/redpanda.test.ts`

---

## Quick Start

### SQL with Drizzle ORM

```typescript
import { SQLConnector } from '@rniverse/connectors';
import { eq } from 'drizzle-orm';

const sql = new SQLConnector({
  url: 'postgres://user:pass@localhost:5432/mydb'
});

// Health check
await sql.health();

// Type-safe Drizzle queries
const client = sql.getInstance();
const users = await client.select().from(usersTable).where(eq(usersTable.age, 30));

// Raw SQL
const results = await client.$client`SELECT * FROM users WHERE age > 25`;
```

### Redis

```typescript
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({
  url: 'redis://localhost:6379'
});

// Health check
await redis.health();

// Operations
const client = redis.getInstance();
await client.set('key', 'value');
const value = await client.get('key');

// Hash operations
await client.hset('user:1', 'name', 'John');
await client.hget('user:1', 'name');
```

### MongoDB

```typescript
import { MongoDBConnector } from '@rniverse/connectors';

const mongo = new MongoDBConnector({
  url: 'mongodb://localhost:27017',
  database: 'mydb'
});

// Health check
await mongo.health();

// Type-safe operations
interface User {
  username: string;
  email: string;
  age: number;
}

const result = await mongo.insertOne<User>('users', {
  username: 'john',
  email: 'john@example.com',
  age: 30
});

const users = await mongo.find<User>('users', { age: { $gte: 25 } });
```

### Redpanda (Kafka)

```typescript
import { RedpandaConnector } from '@rniverse/connectors';

const redpanda = new RedpandaConnector({
  url: 'localhost:9092'
});

// Health check
await redpanda.health();

// Create topic
await redpanda.createTopic({
  topic: 'my-topic',
  numPartitions: 3,
  replicationFactor: 1
});

// Publish
await redpanda.publish({
  topic: 'my-topic',
  messages: [{ value: JSON.stringify({ data: 'message' }) }]
});

// Subscribe
await redpanda.subscribe(
  {
    topics: ['my-topic'],
    groupId: 'my-consumer-group',
    fromBeginning: true
  },
  async (payload) => {
    console.log(payload.message.value?.toString());
  }
);
```

---

## Configuration

All connectors support health checks and connection management:

```typescript
// Check connection health
const health = await connector.health();
console.log(health.ok); // true/false

// Close connections
await connector.close();
```

### SQL Configuration Options

```typescript
type SQLConnectorConfig = {
  // URL format
  url: string;
  // OR Host-based config
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  
  // Pool options
  max?: number;              // default: 20
  idleTimeout?: number;      // default: 30 seconds
  connectionTimeout?: number; // default: 30 seconds
  maxLifetime?: number;      // default: 3600 seconds
  prepare?: boolean;         // default: true
};
```

### Redis Configuration Options

```typescript
type RedisConnectorConfig = {
  url: string;
  
  // Connection options
  connectionTimeout?: number; // default: 10000ms
  idleTimeout?: number;       // default: 30000ms
  autoReconnect?: boolean;    // default: true
  maxRetries?: number;        // default: 10
  enableOfflineQueue?: boolean; // default: true
  enableAutoPipelining?: boolean; // default: true
  
  // TLS
  tls?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
};
```

### MongoDB Configuration Options

```typescript
type MongoDBConnectorConfig = {
  url: string;
  database?: string; // Optional if included in URL
  
  options?: {
    maxPoolSize?: number;      // default: 10
    minPoolSize?: number;      // default: 2
    connectTimeoutMS?: number; // default: 10000
    socketTimeoutMS?: number;  // default: 45000
    serverSelectionTimeoutMS?: number; // default: 10000
    retryWrites?: boolean;     // default: true
    retryReads?: boolean;      // default: true
    appName?: string;
  };
};
```

### Redpanda Configuration Options

```typescript
type RedpandaConnectorConfig = {
  // URL format
  url: string; // 'broker1:9092,broker2:9092'
  // OR brokers array
  brokers: string[];
  
  clientId?: string;
  connectionTimeout?: number; // default: 10000
  requestTimeout?: number;    // default: 30000
  
  // SSL/TLS
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
  };
  
  // SASL Authentication
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  
  // Advanced Kafka configs
  kafka?: Partial<KafkaConfig>;
  producer?: Partial<ProducerConfig>;
  consumer?: Partial<ConsumerConfig>;
  admin?: Partial<AdminConfig>;
};
```

---

## Environment Variables

Recommended environment variables for testing:

```bash
# SQL
POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/testdb

# Redis
REDIS_URL=redis://localhost:6379

# MongoDB
MONGODB_TEST_URL=mongodb://localhost:27017/testdb

# Redpanda
REDPANDA_URL=localhost:9092
```

---

## Testing

### Prerequisites

**SQL (PostgreSQL):**
```bash
# Docker
docker run -d -p 5432:5432 --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=testdb \
  postgres:15

# Or local installation
brew install postgresql@15
brew services start postgresql@15
```

**Redis:**
```bash
# Docker
docker run -d -p 6379:6379 --name redis redis:7

# Or local installation
brew install redis
brew services start redis
```

**MongoDB:**
```bash
# Docker
docker run -d -p 27017:27017 --name mongodb mongo:7

# Or local installation
brew install mongodb-community
brew services start mongodb-community

# Or use MongoDB Atlas (cloud)
```

**Redpanda:**
```bash
# Docker
docker run -d -p 9092:9092 --name redpanda \
  vectorized/redpanda:latest \
  redpanda start --smp 1 --memory 1G --overprovisioned \
  --kafka-addr 0.0.0.0:9092 \
  --advertise-kafka-addr localhost:9092

# Or local installation (macOS)
brew install redpanda-data/tap/redpanda
rpk redpanda start
```

### Run Tests

```bash
# All tests (requires all services)
bun test

# Individual connector tests
bun test lib/test/sql.test.ts
bun test lib/test/sql-drizzle.test.ts
bun test lib/test/redis.test.ts
bun test lib/test/mongodb.test.ts
bun test lib/test/mongodb-multi-connection.test.ts
bun test lib/test/redpanda.test.ts

# All tests except MongoDB
bun test lib/test/sql.test.ts lib/test/sql-drizzle.test.ts lib/test/redis.test.ts lib/test/redpanda.test.ts
```

### Test Coverage

- **SQL**: 50+ tests covering CRUD, joins, aggregations, transactions, CTEs, window functions, cursors
- **Redis**: 30+ tests covering all data types, Pub/Sub, cursors, transactions
- **MongoDB**: 40+ tests covering CRUD, aggregations, indexes, cursors, multi-database
- **Redpanda**: 10+ tests covering topics, publishing, consuming, multi-topic subscriptions

---

## Project Structure

```
connectors/
├── docs/               # Documentation
│   ├── README.md
│   ├── sql.md
│   ├── redis.md
│   ├── mongodb.md
│   └── redpanda.md
├── lib/
│   ├── core/          # Connector implementations
│   │   ├── sql.connector.ts
│   │   ├── redis.connector.ts
│   │   ├── mongodb.connector.ts
│   │   └── redpanda.connector.ts
│   ├── tools/         # Client initialization
│   │   ├── drizzle.tool.ts
│   │   ├── redis.tool.ts
│   │   ├── mongodb.tool.ts
│   │   └── redpanda.tool.ts
│   ├── types/         # TypeScript types
│   │   ├── sql.type.ts
│   │   ├── redis.type.ts
│   │   ├── mongodb.type.ts
│   │   └── redpanda.type.ts
│   └── test/          # Test suites
│       ├── sql.test.ts
│       ├── sql-drizzle.test.ts
│       ├── redis.test.ts
│       ├── mongodb.test.ts
│       ├── mongodb-multi-connection.test.ts
│       ├── redpanda.test.ts
│       └── data/      # Test data and schemas
```

---

## Features by Connector

### SQL Connector
✅ Raw SQL queries  
✅ Drizzle ORM type-safe queries  
✅ Connection pooling  
✅ Transactions  
✅ Joins (INNER, LEFT, RIGHT)  
✅ Aggregations (COUNT, SUM, AVG, GROUP BY)  
✅ Window functions  
✅ CTEs (Common Table Expressions)  
✅ Subqueries  
✅ Cursors (server-side)  
✅ UPSERT operations  

### Redis Connector
✅ String operations (GET, SET, INCR, DECR)  
✅ Hash operations (HSET, HGET, HMGET)  
✅ List operations (LPUSH, RPUSH, LRANGE)  
✅ Set operations (SADD, SMEMBERS, SINTER)  
✅ Sorted Set operations (ZADD, ZRANGE, ZRANK)  
✅ Pub/Sub messaging  
✅ Cursor operations (SCAN, HSCAN, SSCAN, ZSCAN)  
✅ Expiration (TTL, EXPIRE)  
✅ Transactions (MULTI/EXEC)  

### MongoDB Connector
✅ Type-safe CRUD operations  
✅ Aggregation pipelines  
✅ Index management  
✅ Text search  
✅ Cursor operations  
✅ Multi-database support  
✅ Collection management  
✅ Bulk operations  
✅ Transactions (replica sets)  

### Redpanda Connector
✅ Topic management (create, list, delete)  
✅ Producer operations  
✅ Consumer groups  
✅ Multi-topic subscriptions  
✅ Offset management  
✅ Topic metadata  
✅ Message headers  
✅ Partitioning  

---

## Best Practices

### Connection Management

```typescript
// ✅ Good: Reuse connector instances
const connector = new SQLConnector(config);
// Use throughout application lifecycle

// ❌ Bad: Creating new instances per request
app.get('/users', async (req, res) => {
  const connector = new SQLConnector(config); // Don't do this!
});
```

### Error Handling

```typescript
// All operations return { ok, result/error }
const result = await mongo.findOne('users', { _id: userId });

if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

### Type Safety

```typescript
// ✅ Good: Define interfaces for type safety
interface User {
  username: string;
  email: string;
  age: number;
}

const users = await mongo.find<User>('users', { age: { $gte: 25 } });
// users.data is typed as User[]

// ✅ Good: Use Drizzle schema for SQL
import { users } from './schema';
const result = await client.select().from(users);
```

### Resource Cleanup

```typescript
// Always close connections when shutting down
process.on('SIGTERM', async () => {
  await sqlConnector.close?.();
  await redisConnector.close();
  await mongoConnector.close();
  await redpandaConnector.close();
  process.exit(0);
});
```

---

## Troubleshooting

### SQL Connection Issues

```typescript
// Check health
const health = await sql.health();
if (!health.ok) {
  console.error('SQL connection failed');
}

// Increase timeout
const sql = new SQLConnector({
  url: 'postgres://...',
  connectionTimeout: 60 // seconds
});
```

### Redis Connection Issues

```typescript
// Enable auto-reconnect
const redis = new RedisConnector({
  url: 'redis://localhost:6379',
  autoReconnect: true,
  maxRetries: 10
});
```

### MongoDB Connection Issues

```typescript
// Increase server selection timeout
const mongo = new MongoDBConnector({
  url: 'mongodb://localhost:27017',
  options: {
    serverSelectionTimeoutMS: 30000
  }
});
```

### Redpanda Connection Issues

```typescript
// Increase timeouts
const redpanda = new RedpandaConnector({
  url: 'localhost:9092',
  connectionTimeout: 20000,
  requestTimeout: 60000
});
```

---

## Migration from Other Libraries

### From `pg` to SQL Connector

```typescript
// Before (pg)
const pool = new Pool({ ... });
const result = await pool.query('SELECT * FROM users WHERE age > $1', [25]);

// After (SQL Connector)
const sql = new SQLConnector({ ... });
const client = sql.getInstance();
const result = await client.$client`SELECT * FROM users WHERE age > ${25}`;
```

### From `ioredis` to Redis Connector

```typescript
// Before (ioredis)
const redis = new Redis({ host: 'localhost', port: 6379 });
await redis.set('key', 'value');

// After (Redis Connector)
const redis = new RedisConnector({ url: 'redis://localhost:6379' });
const client = redis.getInstance();
await client.set('key', 'value');
```

### From native `mongodb` to MongoDB Connector

```typescript
// Before (native)
const client = new MongoClient(url);
await client.connect();
const db = client.db('mydb');
const users = db.collection('users');
const result = await users.findOne({ _id: userId });

// After (MongoDB Connector)
const mongo = new MongoDBConnector({ url, database: 'mydb' });
const result = await mongo.findOne('users', { _id: userId });
```

---

## Performance Tips

### SQL
- Use connection pooling (enabled by default)
- Use prepared statements (enabled by default)
- Batch inserts with Drizzle's `.values(array)`
- Use indexes on frequently queried columns

### Redis
- Enable auto-pipelining (enabled by default)
- Use `MGET`/`MSET` for batch operations
- Use cursors (SCAN) instead of KEYS
- Set appropriate TTL for cached data

### MongoDB
- Create indexes for frequent queries
- Use projection to limit returned fields
- Use aggregation pipelines for complex queries
- Batch operations with `insertMany`, `updateMany`

### Redpanda
- Use batch publishing
- Configure appropriate partition count
- Use consumer groups for parallel processing
- Set appropriate `maxBytes` for fetching

---

## License

Private package for internal use.

---

## Support

For issues or questions:
1. Check the detailed connector guides in [`docs/`](.)
2. Review test files in [`lib/test/`](../lib/test/)
3. Contact the development team

---

## Related Documentation

- [SQL Connector Guide](./sql.md)
- [Redis Connector Guide](./redis.md)
- [MongoDB Connector Guide](./mongodb.md)
- [Redpanda Connector Guide](./redpanda.md)
