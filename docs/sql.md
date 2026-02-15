# SQL Connector

PostgreSQL connector using Bun's native SQL driver with Drizzle ORM for type-safe queries.

**Driver:** `bun:SQL` + `drizzle-orm/bun-sql`  
**Peer dep:** `drizzle-orm ^0.44.7`

## Setup

```typescript
import { SQLConnector } from '@rniverse/connectors';

// URL-based
const sql = new SQLConnector({ url: 'postgres://user:pass@localhost:5432/mydb' });
await sql.connect(); // mandatory — verifies via SELECT 1

// Host-based
const sql = new SQLConnector({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
  max: 20,               // pool size (default)
  idleTimeout: 30,       // seconds (default)
  maxLifetime: 3600,     // seconds (default)
  connectionTimeout: 30, // seconds (default)
  prepare: true,         // prepared statements (default)
});
await sql.connect();
```

`connect()` is idempotent — calling it again is a no-op if already connected.

## Health Check

```typescript
const h = await sql.health(); // { ok: true } | { ok: false, error }
```

## Drizzle ORM

After connecting, get the Drizzle instance:

```typescript
const orm = sql.getInstance();
```

### Schema definition (Drizzle)

```typescript
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### SELECT

```typescript
import { eq, gt, and, desc, count, sql as raw } from 'drizzle-orm';

// All rows
const users = await orm.select().from(usersTable);

// With conditions
const adults = await orm.select().from(usersTable).where(gt(usersTable.age, 18));

// Combined filters
const result = await orm.select().from(usersTable).where(
  and(gt(usersTable.age, 18), eq(usersTable.name, 'Alice')),
);

// Ordering + limit
const recent = await orm
  .select()
  .from(usersTable)
  .orderBy(desc(usersTable.createdAt))
  .limit(10);

// Partial select
const names = await orm
  .select({ name: usersTable.name, email: usersTable.email })
  .from(usersTable);
```

### INSERT

```typescript
// Single row — .returning() gives back the inserted row
const [user] = await orm
  .insert(usersTable)
  .values({ name: 'Alice', email: 'alice@co.com', age: 28 })
  .returning();

// Batch
await orm.insert(usersTable).values([
  { name: 'Bob', email: 'bob@co.com', age: 32 },
  { name: 'Eve', email: 'eve@co.com', age: 24 },
]);
```

### UPDATE

```typescript
const [updated] = await orm
  .update(usersTable)
  .set({ age: 29 })
  .where(eq(usersTable.email, 'alice@co.com'))
  .returning();
```

### DELETE

```typescript
await orm.delete(usersTable).where(eq(usersTable.name, 'Eve'));
```

### UPSERT (ON CONFLICT)

```typescript
await orm
  .insert(usersTable)
  .values({ name: 'Alice', email: 'alice@co.com', age: 30 })
  .onConflictDoUpdate({
    target: usersTable.email,
    set: { age: 30 },
  });
```

## Joins

```typescript
import { ordersTable } from './schema';

// INNER JOIN
const rows = await orm
  .select({ userName: usersTable.name, orderId: ordersTable.id })
  .from(usersTable)
  .innerJoin(ordersTable, eq(usersTable.id, ordersTable.userId));

// LEFT JOIN
const rows = await orm
  .select()
  .from(usersTable)
  .leftJoin(ordersTable, eq(usersTable.id, ordersTable.userId));
```

## Aggregations

```typescript
import { count, sum, avg } from 'drizzle-orm';

const stats = await orm
  .select({
    total: count(),
    avgAge: avg(usersTable.age),
  })
  .from(usersTable);
```

## Transactions

```typescript
await orm.transaction(async (tx) => {
  const [user] = await tx.insert(usersTable).values({ name: 'Alice', email: 'a@b.com' }).returning();
  await tx.insert(ordersTable).values({ userId: user.id, amount: 100 });
});
```

## Raw SQL

Access Bun's native SQL client via `orm.$client`:

```typescript
// Tagged template (parameterized — safe)
const rows = await orm.$client`SELECT * FROM users WHERE age > ${25}`;

// Dynamic (unsafe — use with caution)
const tableName = 'users';
const rows = await orm.$client.unsafe(`SELECT * FROM ${tableName}`);
```

## Close

```typescript
await sql.close(); // calls $client.close() (synchronous in Bun SQL), resets state
```

---

## Drizzle Kit (Migrations & Schema Management)

Drizzle Kit handles schema generation, migrations, introspection, and a visual studio — all via CLI scripts in `package.json`.

### Scripts

```jsonc
{
  "db:generate":   "drizzle-kit generate",    // generate SQL migration files from schema
  "db:migrate":    "drizzle-kit migrate",      // apply pending migrations
  "db:push":       "drizzle-kit push",         // push schema directly (no migration files)
  "db:introspect": "drizzle-kit introspect",   // pull existing DB schema into Drizzle format
  "db:studio":     "drizzle-kit studio"        // launch visual DB browser
}
```

Every script accepts `--config` to point to a specific config file:

```bash
bun run db:migrate  --config=lib/migrations/myapp.config.ts
bun run db:generate --config=lib/migrations/myapp.config.ts
bun run db:push     --config=lib/migrations/myapp.config.ts
bun run db:studio   --config=lib/migrations/myapp.config.ts
```

### Config File

Create one config per database/schema. See `lib/migrations/drizzle.config.sample.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/migrations/schema.sample.ts',  // your schema file(s)
  out: './lib/migrations/out',                   // generated migration SQL output
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

| Field | Description |
|-------|-------------|
| `dialect` | `'postgresql'`, `'mysql'`, `'sqlite'`, `'turso'` |
| `schema` | Path (or glob) to your Drizzle schema files |
| `out` | Directory for generated migration SQL files |
| `dbCredentials.url` | Postgres connection string |
| `verbose` | Log SQL statements during migration |
| `strict` | Require confirmation for destructive changes |

### Schema File

Define your tables with Drizzle's type-safe schema builder:

```typescript
import { pgTable, serial, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age'),
  active: boolean('active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
```

### Workflow

#### 1. Initial setup — push schema directly

For greenfield projects, push the schema without generating migration files:

```bash
bun run db:push --config=lib/migrations/myapp.config.ts
```

#### 2. Ongoing — generate & migrate

After the initial push, use the generate → migrate cycle:

```bash
# Edit your schema file, then:
bun run db:generate --config=lib/migrations/myapp.config.ts
# → creates SQL migration in out/ directory

bun run db:migrate --config=lib/migrations/myapp.config.ts
# → applies pending migrations to the database
```

#### 3. Introspect an existing database

Pull an existing DB schema into Drizzle format:

```bash
bun run db:introspect --config=lib/migrations/myapp.config.ts
# → generates schema .ts files from the live database
```

#### 4. Visual studio

Browse your database visually:

```bash
bun run db:studio --config=lib/migrations/myapp.config.ts
# → opens https://local.drizzle.studio
```

### Multi-Database Setup

Create one config file per database:

```
lib/migrations/
├── drizzle.config.sample.ts   # template
├── users.config.ts            # users database
├── analytics.config.ts        # analytics database
└── out/                       # generated migrations
    ├── 0000_initial.sql
    └── 0001_add_email_index.sql
```

```bash
bun run db:migrate --config=lib/migrations/users.config.ts
bun run db:migrate --config=lib/migrations/analytics.config.ts
```

### Environment Variables

Set `DATABASE_URL` in `.env` or pass it inline:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/mydb bun run db:migrate --config=lib/migrations/myapp.config.ts
```

---

## Full API

| Method | Returns |
|--------|---------|
| `connect()` | `Promise<void>` |
| `health()` / `ping()` | `{ ok }` or `{ ok, error }` |
| `getInstance()` | `BunSQLDrizzle` (Drizzle ORM instance) |
| `close()` | `Promise<void>` |

All query operations go through `getInstance()` — the connector manages the connection lifecycle, Drizzle manages queries.
