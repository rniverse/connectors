# MongoDB Connector

Type-safe MongoDB connector with full CRUD, aggregation pipelines, index management, and multi-database support.

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

## Result Pattern

Every CRUD method returns a discriminated union:

```typescript
type Ok<T>  = { ok: true;  data: T };
type Err     = { ok: false; error: unknown };

const r = await mongo.findOne<User>('users', { email });
if (r.ok) {
  r.data; // User | null
} else {
  r.error; // the caught exception
}
```

## CRUD Operations

### Find

```typescript
interface User { name: string; email: string; age: number }

// Find one
const r = await mongo.findOne<User>('users', { name: 'Alice' });

// Find many
const all = await mongo.find<User>('users', { age: { $gte: 18 } });

// With options
const recent = await mongo.find<User>(
  'users',
  {},
  { sort: { createdAt: -1 }, limit: 10, projection: { name: 1, email: 1 } },
);
```

### Insert

```typescript
// One
const r = await mongo.insertOne<User>('users', {
  name: 'Alice', email: 'alice@co.com', age: 28,
});
if (r.ok) console.log(r.data.insertedId);

// Many
const batch = await mongo.insertMany<User>('users', [
  { name: 'Bob', email: 'bob@co.com', age: 32 },
  { name: 'Eve', email: 'eve@co.com', age: 24 },
]);
if (batch.ok) console.log(batch.data.insertedCount);
```

### Update

```typescript
// One
await mongo.updateOne<User>('users', { email: 'alice@co.com' }, { $set: { age: 29 } });

// Many
await mongo.updateMany<User>('users', { age: { $lt: 18 } }, { $set: { status: 'minor' } });
```

### Delete

```typescript
await mongo.deleteOne<User>('users', { email: 'alice@co.com' });
await mongo.deleteMany<User>('users', { age: { $lt: 18 } });
```

### Count

```typescript
const r = await mongo.countDocuments<User>('users', { age: { $gte: 25 } });
if (r.ok) console.log(r.data); // number
```

## Aggregation Pipelines

```typescript
const r = await mongo.aggregate<User>('orders', [
  { $match: { status: 'completed' } },
  { $group: { _id: '$customerId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
]);
if (r.ok) console.log(r.data); // Document[]
```

### Lookup (join)

```typescript
await mongo.aggregate('orders', [
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $unwind: '$user' },
  { $project: { orderId: 1, amount: 1, 'user.name': 1 } },
]);
```

## Index Management

```typescript
// Unique index
await mongo.createIndex<User>('users', { email: 1 }, { unique: true, name: 'email_unique' });

// Compound index
await mongo.createIndex<User>('users', { name: 1, age: -1 }, { name: 'name_age_idx' });

// Text index (requires single text index per collection)
await mongo.createIndex('articles', { title: 'text', body: 'text' });
```

## Collection Management

```typescript
const cols = await mongo.listCollections();
if (cols.ok) console.log(cols.data.map(c => c.name));

await mongo.dropCollection('temp_data');
```

## Multi-Database Access

```typescript
// Get a Db instance for another database
const analyticsDb = mongo.getDB('analytics');

// Get a typed collection from another database
const events = mongo.getCollection<Event>('events', { db: 'analytics' });
const cursor = events.find({ type: 'click' });
await cursor.forEach(doc => process.stdout.write(doc.type));
```

## Raw Collection Access

For operations not wrapped by the connector, drop down to the native collection:

```typescript
const col = mongo.getCollection<User>('users');

// Cursor
const cursor = col.find({ age: { $gte: 25 } }).sort({ name: 1 }).limit(100);
for await (const doc of cursor) {
  // stream results
}

// Bulk write
await col.bulkWrite([
  { insertOne: { document: { name: 'X', email: 'x@co.com', age: 20 } } },
  { updateOne: { filter: { name: 'Bob' }, update: { $inc: { age: 1 } } } },
]);

// Distinct
const emails = await col.distinct('email', { age: { $gte: 18 } });
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

| Method | Returns |
|--------|---------|
| `connect()` | `Promise<void>` |
| `health()` / `ping()` | `{ ok, result/error }` |
| `getInstance()` | `Db` |
| `getClientInstance()` | `MongoClient` |
| `getDB(name)` | `Db` |
| `getCollection<T>(name, opts?)` | `Collection<T>` |
| `findOne<T>(col, filter, opts?)` | `{ ok, data }` |
| `find<T>(col, filter?, opts?)` | `{ ok, data }` |
| `insertOne<T>(col, doc)` | `{ ok, data }` |
| `insertMany<T>(col, docs, opts?)` | `{ ok, data }` |
| `updateOne<T>(col, filter, update)` | `{ ok, data }` |
| `updateMany<T>(col, filter, update)` | `{ ok, data }` |
| `deleteOne<T>(col, filter)` | `{ ok, data }` |
| `deleteMany<T>(col, filter)` | `{ ok, data }` |
| `countDocuments<T>(col, filter?)` | `{ ok, data }` |
| `aggregate<T>(col, pipeline)` | `{ ok, data }` |
| `createIndex<T>(col, spec, opts?)` | `{ ok, data }` |
| `listCollections()` | `{ ok, data }` |
| `dropCollection(name)` | `{ ok }` |
| `close()` | `Promise<void>` |
