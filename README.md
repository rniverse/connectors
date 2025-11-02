# connectors

A comprehensive TypeScript connector library for SQL (with Drizzle ORM), Redis, Redpanda (Kafka), and MongoDB.

## Installation

```bash
bun install
```

## Available Connectors

### 1. SQL Connector (with Drizzle ORM)
- Raw SQL queries with `postgres` driver
- Drizzle ORM for type-safe queries
- Connection pooling with `pg-pool`
- Transactions, aggregations, joins, CTEs, window functions
- Tests: `bun test lib/test/sql.test.ts lib/test/sql-drizzle.test.ts`

### 2. Redis Connector
- Comprehensive Redis operations (strings, hashes, lists, sets, sorted sets)
- Pub/Sub support
- Connection health checks
- Tests: `bun test lib/test/redis-comprehensive.test.ts`

### 3. Redpanda Connector (Kafka-compatible)
- Producer and consumer operations
- Topic management
- Offset management
- Tests: `bun test lib/test/redpanda.test.ts`

### 4. MongoDB Connector
- Type-safe CRUD operations with generics
- Aggregation pipeline support
- Index management
- Collection management
- Text search capabilities
- **Requirements**: MongoDB server must be running
  - Local: `brew install mongodb-community && brew services start mongodb-community`
  - Docker: `docker run -d -p 27017:27017 --name mongodb mongo`
  - Or use MongoDB Atlas (cloud)
- Tests: `bun test lib/test/mongodb.test.ts` (requires MongoDB at `mongodb://localhost:27017/testdb`)

## Usage Examples

### SQL with Drizzle ORM
```typescript
import { SQLConnector } from '@connectors/core';

const sql = new SQLConnector({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password'
});

// Drizzle ORM query
const users = await sql.select().from(usersTable).where(eq(usersTable.age, 30));
```

### Redis
```typescript
import { RedisConnector } from '@connectors/core';

const redis = new RedisConnector({
  host: 'localhost',
  port: 6379
});

await redis.set('key', 'value');
const value = await redis.get('key');
```

### MongoDB
```typescript
import { MongoDBConnector } from '@connectors/core';

const mongo = new MongoDBConnector({
  url: 'mongodb://localhost:27017',
  database: 'mydb'
});

// Type-safe operations
interface User {
  name: string;
  email: string;
  age: number;
}

const result = await mongo.insertOne<User>('users', {
  name: 'John',
  email: 'john@example.com',
  age: 30
});

const users = await mongo.find<User>('users', { age: { $gte: 25 } });
```

### Redpanda (Kafka)
```typescript
import { RedpandaConnector } from '@connectors/core';

const redpanda = new RedpandaConnector({
  brokers: ['localhost:9092'],
  clientId: 'my-app'
});

await redpanda.produce('my-topic', [{ value: 'message' }]);
```

## Running Tests

All tests (excluding MongoDB):
```bash
bun test lib/test/sql.test.ts lib/test/sql-drizzle.test.ts lib/test/redis-comprehensive.test.ts lib/test/redpanda.test.ts
```

MongoDB tests (requires MongoDB server):
```bash
bun test lib/test/mongodb.test.ts
```

## Project Structure

```
lib/
├── core/              # Connector implementations
│   ├── sql.connector.ts
│   ├── redis.connector.ts
│   ├── redpanda.connector.ts
│   └── mongodb.connector.ts
├── tools/             # Client initialization utilities
├── types/             # TypeScript type definitions
├── utils/             # Logger and utilities
└── test/              # Comprehensive test suites
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
