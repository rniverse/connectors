# MongoDB Connector Guide

Type-safe MongoDB connector with full CRUD operations and aggregation support.

## Configuration

```typescript
import { MongoDBConnector } from '@rniverse/connectors';

const mongo = new MongoDBConnector({
  url: 'mongodb://localhost:27017',
  database: 'mydb'
});
```

## Basic Usage

```typescript
// Health check
const health = await mongo.health();

// Get database
const db = mongo.getInstance();

// Get collection
const collection = mongo.getCollection<User>('users');
```

## CRUD Operations

### Find

```typescript
interface User {
  username: string;
  email: string;
  age: number;
}

// Find one
const result = await mongo.findOne<User>('users', { username: 'alice' });
if (result.ok && result.data) {
  console.log(result.data);
}

// Find many
const users = await mongo.find<User>('users', { age: { $gte: 18 } });

// With options
const recent = await mongo.find<User>(
  'users',
  {},
  {
    sort: { createdAt: -1 },
    limit: 10,
    projection: { username: 1, email: 1 }
  }
);
```

### Insert

```typescript
// Insert one
const result = await mongo.insertOne<User>('users', {
  username: 'john',
  email: 'john@example.com',
  age: 30
});

// Insert many
const result = await mongo.insertMany<User>('users', [
  { username: 'alice', email: 'alice@example.com', age: 25 },
  { username: 'bob', email: 'bob@example.com', age: 35 }
]);
```

### Update

```typescript
// Update one
const result = await mongo.updateOne<User>(
  'users',
  { username: 'alice' },
  { $set: { age: 26 } }
);

// Update many
await mongo.updateMany<User>(
  'users',
  { age: { $lt: 18 } },
  { $set: { status: 'minor' } }
);
```

### Delete

```typescript
// Delete one
await mongo.deleteOne<User>('users', { username: 'alice' });

// Delete many
await mongo.deleteMany<User>('users', { age: { $lt: 18 } });
```

## Aggregation Pipelines

```typescript
const result = await mongo.aggregate<Product>('products', [
  { $match: { category: 'Electronics' } },
  {
    $group: {
      _id: '$category',
      totalStock: { $sum: '$stock' },
      avgPrice: { $avg: '$price' },
      count: { $sum: 1 }
    }
  },
  { $sort: { totalStock: -1 } }
]);
```

## Index Management

```typescript
// Create index
const result = await mongo.createIndex<User>(
  'users',
  { email: 1 },
  { unique: true, name: 'email_unique_idx' }
);

// Compound index
await mongo.createIndex<User>(
  'users',
  { username: 1, email: 1 },
  { name: 'username_email_idx' }
);
```

## Cursor Operations

```typescript
const collection = mongo.getCollection<User>('users');
const cursor = collection.find({ age: { $gte: 25 } });

await cursor.forEach((doc) => {
  console.log(doc.username);
});
```

## Multi-Database Support

```typescript
// Access different databases
const usersDb = mongo.getDB('users_db');
const productsDb = mongo.getDB('products_db');

// Get collections from different databases
const users = mongo.getCollection<User>('users', { db: 'users_db' });
const products = mongo.getCollection<Product>('products', { db: 'products_db' });
```

## Advanced Features

See [test files](../lib/test/mongodb.test.ts) for examples of:
- Complex aggregation pipelines
- Lookup (joins)
- Text search
- Collection management
- Multi-database connections
- Query operators ($gt, $gte, $in, $nin, etc.)
- Update operators ($set, $inc, $push, $pull, etc.)

## References

- [MongoDB Documentation](https://www.mongodb.com/docs/)
- [Test Examples](../lib/test/mongodb.test.ts)
- [Multi-DB Examples](../lib/test/mongodb-multi-connection.test.ts)
