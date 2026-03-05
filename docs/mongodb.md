# MongoDB Connector

Connection wrapper for the official MongoDB Node.js driver. It manages the connection pool lifecycle and health checks.

**Driver:** Official `mongodb` Node.js driver  
**Peer dep:** `mongodb ^6.20.0`

## Setup

```typescript
import { MongoDBConnector } from '@rniverse/connectors';

const mongo = new MongoDBConnector({
  url: 'mongodb://localhost:27017',
  database: 'mydb',
  options: {
    maxPoolSize: 10,              // default
    minPoolSize: 2,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
    appName: 'my-service',
  },
});

await mongo.connect(); // mandatory — verifies via admin ping
```

`connect()` is idempotent and resets on failure so retries work:

```typescript
try { await mongo.connect(); }
catch { await Bun.sleep(3000); await mongo.connect(); }
```

## Health Check

```typescript
const h = await mongo.health(); // { ok: true, result } | { ok: false, error }
```

## Querying (CRUD)

After connecting, use `getInstance()` to get the native `Db` object. All operations use the official MongoDB Node.js driver API.

```typescript
interface User { name: string; email: string; age: number }

const db = mongo.getInstance();
const users = db.collection<User>('users');

// Insert
const insertRes = await users.insertOne({ name: 'Alice', email: 'alice@co.com', age: 28 });
console.log(insertRes.insertedId);

// Find
const adults = await users.find({ age: { $gte: 18 } }).toArray();

const recent = await users.find({})
  .sort({ createdAt: -1 })
  .limit(10)
  .project({ name: 1, email: 1 })
  .toArray();

// Update
await users.updateOne({ email: 'alice@co.com' }, { $set: { age: 29 } });

// Delete
await users.deleteMany({ age: { $lt: 18 } });

// Count
const count = await users.countDocuments({ age: { $gte: 25 } });
```

## Aggregation Pipelines

```typescript
const db = mongo.getInstance();
const results = await db.collection('orders').aggregate([
  { $match: { status: 'completed' } },
  { $group: { _id: '$customerId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
]).toArray();
```

## Index Management

```typescript
const db = mongo.getInstance();
const users = db.collection('users');

// Unique index
await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });

// Compound index
await users.createIndex({ name: 1, age: -1 }, { name: 'name_age_idx' });
```

## Cursor / Streaming
For large datasets, use the cursor to iterate asynchronously rather than loading everything into memory with `.toArray()`.

```typescript
const db = mongo.getInstance();
const cursor = db.collection<User>('users').find({ age: { $gte: 25 } });

for await (const doc of cursor) {
  // Process one document at a time
  console.log(doc.name);
}
```

## Multi-Database Access

If your cluster has multiple databases, you can get a `Db` instance for a different one:

```typescript
// Get a Db instance for another database
const analyticsDb = mongo.getDB('analytics');
const events = analyticsDb.collection('events');

const allEvents = await events.find({ type: 'click' }).toArray();
```

## Underlying Instances

```typescript
mongo.getInstance();        // Db (default database)
mongo.getClientInstance();  // MongoClient
mongo.getDB('other');       // Db for a different database
```

## Close

```typescript
await mongo.close();
// Resets client, db, and init_promise — safe to reconnect after.
```

## Full API

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Initializes connection and verifies connection via ping |
| `health()` / `ping()` | `{ ok: boolean, result?: any, error?: any }` | Performs admin ping |
| `getInstance()` | `Db` | Returns the native MongoDB `Db` instance |
| `getClientInstance()` | `MongoClient` | Returns the native `MongoClient` instance |
| `getDB(name)` | `Db` | Returns a Db instance for a specific database |
| `close()` | `Promise<void>` | Closes the connection pool |
