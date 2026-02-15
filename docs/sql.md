# SQL Connector Guide

PostgreSQL connector with Drizzle ORM for type-safe database operations.

## Configuration

```typescript
import { SQLConnector } from '@rniverse/connectors';

const connector = new SQLConnector({
  url: 'postgres://user:password@localhost:5432/dbname'
});
```

## Basic Usage

```typescript
// Health check
const health = await connector.health();

// Get client
const client = connector.getInstance();
```

## Drizzle ORM Examples

### SELECT

```typescript
import { eq, gt, and, desc } from 'drizzle-orm';

// All records
const users = await client.select().from(usersTable);

// With conditions
const adults = await client
  .select()
  .from(usersTable)
  .where(gt(usersTable.age, 18));

// With ordering and limit
const recent = await client
  .select()
  .from(usersTable)
  .orderBy(desc(usersTable.createdAt))
  .limit(10);
```

### INSERT

```typescript
// Single insert
const [user] = await client
  .insert(usersTable)
  .values({ username: 'john', email: 'john@example.com' })
  .returning();

// Batch insert
await client
  .insert(usersTable)
  .values([
    { username: 'alice', email: 'alice@example.com' },
    { username: 'bob', email: 'bob@example.com' }
  ]);
```

### UPDATE

```typescript
const [updated] = await client
  .update(usersTable)
  .set({ age: 26 })
  .where(eq(usersTable.username, 'alice'))
  .returning();
```

### DELETE

```typescript
await client
  .delete(usersTable)
  .where(eq(usersTable.username, 'alice'));
```

## Raw SQL

```typescript
// Parameterized query
const results = await client.$client`
  SELECT * FROM users WHERE age > ${25}
`;

// Unsafe (for dynamic queries)
const results = await client.$client.unsafe(`
  SELECT * FROM ${tableName}
`);
```

## Joins & Aggregations

See [test files](../lib/test/sql-drizzle.test.ts) for comprehensive examples of:
- INNER/LEFT/RIGHT joins
- GROUP BY and aggregations (COUNT, SUM, AVG)
- Subqueries
- CTEs (Common Table Expressions)
- Window functions
- Transactions

## References

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Test Examples](../lib/test/sql-drizzle.test.ts)
