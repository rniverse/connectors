# @rniverse/connectors

Connection-lifecycle wrappers for **PostgreSQL** (Drizzle ORM + postgres.js),
**Redis** (valkey-glide), **MongoDB**, and **Redpanda** (KafkaJS).

This file is the SDK reference — every class, its config, and its methods. You
shouldn't need to open the source to use it.

---

## Install

```bash
bun add github:rniverse/connectors#dist
```

Install only the peer deps for the connectors you use:

| peer | version | for |
|---|---|---|
| `@rniverse/utils` | `github:rniverse/utils#dist` | always (logging, env, retry) |
| `drizzle-orm` + `postgres` | `^0.45.2` / `^3.4.9` | `SQLConnector` |
| `@valkey/valkey-glide` | `^2.5.2` | `RedisConnector` |
| `mongodb` | `^7.6.0` | `MongoDBConnector` |
| `kafkajs` | `^2.2.4` | `RedpandaConnector` |
| `typescript` | `^7.0.2` | build |

### Entry points

Importing from the package root loads **all four drivers**. Import a subpath to
pull in only the one you need (so you can install only its peers):

| import | loads |
|---|---|
| `@rniverse/connectors` | everything |
| `@rniverse/connectors/sql` | `SQLConnector`, `initORM`, SQL types — `drizzle-orm` + `postgres` only |
| `@rniverse/connectors/mongodb` | `MongoDBConnector`, `initMongoDB`, `closeMongoDB` — `mongodb` only |
| `@rniverse/connectors/redis` | `RedisConnector`, `GlideClientAdapter`, `initRedis`, `parseRedisUrl` — `@valkey/valkey-glide` only |
| `@rniverse/connectors/redpanda` | `RedpandaConnector`, `initRedpanda` — `kafkajs` only |

The circuit breaker itself comes from `@rniverse/utils/resilience` (`CircuitBreaker`); connectors no longer export one. `HealthCheck` (the per-connector wrapper) is on the root only.

## Common behaviour

**Lifecycle** — same for every connector:

```
new Connector(config) → await connector.connect() → connector.getInstance() … → await connector.close()
```

- `connect()` is idempotent: concurrent / repeated calls share one in-flight
  connect (`lazy` from `@rniverse/utils`). On failure it's cleared so the next
  call retries. A `close()` while a connect is in flight wins: that connect is
  discarded (it rejects with `…closed while connecting`) instead of reviving the
  connector.
- Operations before a successful `connect()` throw.
- `getInstance()` returns the underlying driver object — you use the driver's own
  API from there.

**`health()` + circuit breaker** — every connector has `ping()`, `health()`, and
a `circuit` getter.

- Each `health()` check: `connect()` (a no-op while connected) then `ping()`,
  each ping limited to `timeout` ms (default **2000**), retried up to
  `attempts` times (default **3**, exponential backoff from 10 ms). A ping that
  *returns* `{ ok: false }` counts as a failure just like one that throws.
- Checks feed a per-connector circuit breaker (`CircuitBreaker` from
  `@rniverse/utils/resilience`). After `threshold` **consecutive failed
  checks** (default **3** — a check, not a ping) the circuit *opens*: the
  connector calls its own `close()` to free the pool/sockets/timers, and
  `health()` fails fast (`CircuitOpenError`, no ping) until `cooldown` passes
  (default **30000** ms).
- After `cooldown` the next `health()` is the single trial: it reconnects and
  pings. Success closes the circuit — **the connector recovers on its own**,
  nobody has to call `connect()` again. Failure reopens it.
- `health()` never throws. Worst case ≈ `attempts × timeout` + backoff
  (~6.1 s with defaults).
- `connector.circuit` is `'closed'` (healthy) · `'open'` (down, connection
  released) · `'half-open'` (cooldown passed; next `health()` is the trial).

**Manual control** — for admin endpoints and maintenance:

```ts
await connector.health({ trial: true })   // test now: reconnect + ping, skipping the rest of the cooldown
connector.breaker.open({ ms: 60_000 })     // take it out of service (also closes the connection)
connector.breaker.reset()                  // force the circuit closed
connector.breaker.failures                 // consecutive failed checks
connector.breaker.remaining                // ms until the next check is allowed
```

`breaker` is utils' `CircuitBreaker`. Prefer `health({ trial: true })` over
`breaker.trial(...)` — it reconnects and pings for you.

Settings — each falls back to its env var, then the default:

```ts
new SQLConnector({ url, health: { attempts: 3, timeout: 2_000, threshold: 3, cooldown: 30_000 } })
```

`ping()` / `health()` return a `Result` from `@rniverse/utils`:

```ts
type Result<T = unknown, E = unknown> = { ok: true; data?: T } | { ok: false; error: E }
```

**Environment variables**

| var | effect |
|---|---|
| `INSTANCE_NAME` | default identity tag for every connector — Postgres `application_name`, Mongo `appName`, Redis `CLIENT SETNAME`, Kafka `clientId`. Falls back to `"connectors"`. Overridden per-connector by `config.appName` (`config.clientId` for Redpanda). |
| `MAX_HEALTH_RETRIES` | `ping()` attempts per `health()` check (default `3`); `config.health.attempts` wins |
| `HEALTH_TIMEOUT_MS` | ms each ping (incl. reconnect) may take (default `2000`); `config.health.timeout` wins |
| `CIRCUIT_THRESHOLD` | consecutive failed `health()` checks before the circuit opens (default `3`); `config.health.threshold` wins |
| `CIRCUIT_COOLDOWN_MS` | ms the circuit stays `open` before the trial check (default `30000`); `config.health.cooldown` wins |
| `SQL_CLOSE_TIMEOUT_S` | seconds postgres.js waits for in-flight queries before force-close (default `5`) |

`LOG_LEVEL` / `LOG_PRETTY` / `NODE_ENV` are read by `@rniverse/utils`'s logger.

---

## SQLConnector

PostgreSQL via Drizzle ORM over postgres.js.

```ts
new SQLConnector(config: SQLConnectorConfig)
```

| method | returns | notes |
|---|---|---|
| `connect()` | `Promise<void>` | creates the pool, verifies with `SELECT 1` |
| `getInstance()` | Drizzle ORM client | `.select()`, `.insert()`, … ; `.$client` is the raw postgres.js tagged-template client for raw SQL |
| `ping()` | `Promise<Result<void>>` | one `SELECT 1` |
| `health({ trial? })` | `Promise<Result<void>>` | reconnect + time-limited, retried `ping`; circuit breaker; never throws |
| `circuit` | `BreakerState` (getter) | `'closed'` / `'open'` / `'half-open'` |
| `breaker` | `CircuitBreaker` (getter) | manual `open({ ms })` / `reset()`; `failures`, `remaining` |
| `close(options?)` | `Promise<void>` | `options.timeout` = seconds to wait for in-flight queries before force-close. Omit → `SQL_CLOSE_TIMEOUT_S` (default 5); `0` = immediate |

```ts
type SQLConnectorConfig = SQLConnectorURLConfig | SQLConnectorHostConfig

type SQLConnectorURLConfig  = { url: string } & Partial<SQLConnectorOptionsConfig>
type SQLConnectorHostConfig = { host: string; port: number; database: string;
                                user: string; password: string } & Partial<SQLConnectorOptionsConfig>

type SQLConnectorOptionsConfig = {
  max: number               // pool size          (default 20)
  idleTimeout: number       // seconds            (default 30)
  connectionTimeout: number // seconds            (default 30)
  maxLifetime: number       // seconds            (default 3600)
  prepare: boolean          //                    (default true)
  appName: string           // → application_name (default INSTANCE_NAME → "connectors")
  connection: Record<string, string | number | boolean> // raw postgres.js server GUCs
}
```

```ts
import { SQLConnector } from '@rniverse/connectors';
import { eq } from 'drizzle-orm';

const sql = new SQLConnector({ url: 'postgres://user:pass@localhost:5432/mydb' });
await sql.connect();

const db = sql.getInstance();
await db.select().from(users).where(eq(users.age, 30));
await db.$client`SELECT * FROM users WHERE age > ${25}`;   // raw

await sql.close();
```

---

## MongoDBConnector

```ts
new MongoDBConnector(config: MongoDBConnectorConfig)
```

| method | returns | notes |
|---|---|---|
| `connect()` | `Promise<Db>` | connects and pings the admin db |
| `getInstance()` | `Db` | the configured database |
| `getClientInstance()` | `MongoClient` | the underlying client |
| `getDB(name)` | `Db` | another database on the same client |
| `ping()` | `Promise<Result<Record<string, unknown>>>` | `db.admin().ping()` |
| `health({ trial? })` | `Promise<Result<Record<string, unknown>>>` | reconnect + time-limited, retried `ping`; circuit breaker; never throws |
| `circuit` | `BreakerState` (getter) | `'closed'` / `'open'` / `'half-open'` |
| `breaker` | `CircuitBreaker` (getter) | manual `open({ ms })` / `reset()`; `failures`, `remaining` |
| `close()` | `Promise<void>` | closes the client |

```ts
type MongoDBConnectorConfig = {
  url: string                 // 'mongodb://…' / 'mongodb+srv://…'
  database?: string           // else taken from the URL, else driver default
  appName?: string            // default INSTANCE_NAME → "connectors"
  options?: {
    maxPoolSize?: number               // default 10
    minPoolSize?: number               // default 2
    connectTimeoutMS?: number          // default 10000
    socketTimeoutMS?: number           // default 45000
    serverSelectionTimeoutMS?: number  // default 10000
    retryWrites?: boolean              // default true
    retryReads?: boolean               // default true
    appName?: string
  }
}
```

```ts
import { MongoDBConnector } from '@rniverse/connectors';

const mongo = new MongoDBConnector({ url: 'mongodb://localhost:27017', database: 'mydb' });
await mongo.connect();

const db = mongo.getInstance();
await db.collection('users').insertOne({ name: 'Alice', age: 28 });

await mongo.close();
```

---

## RedisConnector

valkey-glide, wrapped in a Redis-style command adapter.

```ts
new RedisConnector(config: RedisConnectorConfig)
```

| method | returns | notes |
|---|---|---|
| `connect()` | `Promise<void>` | creates the client, `PING`s |
| `getInstance()` | `GlideClientAdapter` | the command surface below |
| `ping()` | `Promise<Result<unknown>>` | |
| `health({ trial? })` | `Promise<Result<unknown>>` | reconnect + time-limited, retried `ping`; circuit breaker; never throws |
| `circuit` | `BreakerState` (getter) | `'closed'` / `'open'` / `'half-open'` |
| `breaker` | `CircuitBreaker` (getter) | manual `open({ ms })` / `reset()`; `failures`, `remaining` |
| `subscriber.add()` | `Promise<GlideClientAdapter>` | a tracked, dedicated pub/sub connection |
| `subscriber.release(sub)` | `void` | close + untrack one `subscriber.add()` |
| `close()` | `Promise<void>` | also closes every `subscriber.add()` handed out |

```ts
type RedisConnectorConfig = RedisConnectionURLConfig | RedisConnectionConfig

type RedisConnectionURLConfig = { url: string } & RedisConnectorOptionsConfig
  // 'redis://[user:pass@]host:port'  |  'rediss://…' for TLS

type RedisConnectionConfig = {
  host: string
  port: number
  useTLS?: boolean
  credentials?: { username?: string; password: string }
} & RedisConnectorOptionsConfig

type RedisConnectorOptionsConfig = {
  requestTimeout?: number     // ms, whole request incl. retries   (default 10000)
  connectionTimeout?: number  // ms, establish a connection        (default 10000)
  tlsInsecure?: boolean       // skip TLS cert validation           (default false)
  appName?: string            // → CLIENT SETNAME  (default INSTANCE_NAME → "connectors")
}
```

### `GlideClientAdapter`

Returned by `redis.getInstance()`. `.glideClient` is the raw `GlideClient`.

| method | returns |
|---|---|
| `get(key)` | `Promise<string \| null>` |
| `set(key, value, options?)` | `Promise<string \| null>` — `options: RedisSetOptions` (below) |
| `del(...keys)` | `Promise<number>` |
| `exists(...keys)` | `Promise<boolean>` — `true` only if **every** key exists |
| `expire(key, seconds)` | `Promise<boolean>` |
| `ttl(key)` | `Promise<number>` |
| `incr(key)` / `decr(key)` | `Promise<number>` |
| `hset(key, field, value)` | `Promise<number>` |
| `hget(key, field)` | `Promise<string \| null>` |
| `hmset(key, [f1, v1, f2, v2, …])` | `Promise<string \| null>` |
| `hmget(key, [f1, f2, …])` | `Promise<(string \| null)[]>` |
| `hincrby(key, field, n)` | `Promise<number>` |
| `sadd(key, ...members)` | `Promise<number>` |
| `smembers(key)` | `Promise<string[]>` |
| `sismember(key, member)` | `Promise<boolean>` |
| `publish(channel, message)` | `Promise<number>` |
| `subscribe(channel, cb: (msg: string) => void)` | `Promise<void>` |
| `unsubscribe(channel)` | `Promise<void>` |
| `send(command, args: string[])` | `Promise<any>` — arbitrary command, e.g. `send('PING', [])` |
| `duplicate()` | `Promise<GlideClientAdapter>` — a second raw connection (**untracked**; prefer `redis.subscriber.add()`) |
| `close()` | `void` |

```ts
type RedisSetOptions = {
  EX?: number       // expire in N seconds
  PX?: number       // expire in N milliseconds
  KEEPTTL?: boolean // keep the existing TTL
  NX?: boolean      // only set if the key does not exist
  XX?: boolean      // only set if the key exists
  GET?: boolean     // return the previous value instead of "OK"
}
```

Pub/sub goes over one connection via RESP3 multiplexing, so `subscribe()` on the
main client is fine — it can still run `get`/`set`. Use `redis.subscriber.add()` for a dedicated, tracked connection.

```ts
import { RedisConnector } from '@rniverse/connectors';

const redis = new RedisConnector({ url: 'redis://localhost:6379' });
await redis.connect();

const r = redis.getInstance();
await r.set('k', 'v', { EX: 60, NX: true });
await r.get('k');

const sub = await redis.subscriber.add();
await sub.subscribe('events', (msg) => console.log(msg));

await redis.close(); // closes sub too
```

---

## RedpandaConnector

KafkaJS. The Kafka client is built in the constructor; `connect()` verifies with
an admin `listTopics()`.

```ts
new RedpandaConnector(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig)
```

| method | returns | notes |
|---|---|---|
| `connect()` | `Promise<Admin>` | connects the admin client, `listTopics()` |
| `getAdmin()` | `Promise<Admin>` | lazy, cached |
| `getProducer(config?)` | `Promise<Producer>` | connected; tracked for `close()` |
| `getConsumer(config)` | `Promise<Consumer>` | connected; tracked for `close()` |
| `disconnect(client)` | `Promise<void>` | disconnect a producer/consumer **and** untrack it |
| `getInstance()` | `Kafka` | the raw kafkajs instance |
| `ping()` | `Promise<Result<void>>` | admin `listTopics()` |
| `health({ trial? })` | `Promise<Result<void>>` | reconnect + time-limited, retried `ping`; circuit breaker; never throws |
| `circuit` | `BreakerState` (getter) | `'closed'` / `'open'` / `'half-open'` |
| `breaker` | `CircuitBreaker` (getter) | manual `open({ ms })` / `reset()`; `failures`, `remaining` |
| `close()` | `Promise<void>` | disconnects the admin + every tracked producer/consumer |

```ts
type RedpandaConnectorConfig    = RedpandaConnectorCommonConfig & { brokers: string[] }
type RedpandaConnectorURLConfig = RedpandaConnectorCommonConfig & { url: string }
  // url: 'host:9092'  or  'b1:9092,b2:9092'

type RedpandaConnectorCommonConfig = {
  clientId?: string           // default: appName → INSTANCE_NAME → "connectors"
  appName?: string
  connectionTimeout?: number  // ms (default 10000)
  requestTimeout?: number     // ms (default 30000)
  ssl?: RedpandaTLSConfig
  sasl?: RedpandaSASLConfig
  kafka?: Partial<KafkaConfig> // raw kafkajs config; spread last, wins
}

type RedpandaTLSConfig  = boolean | { rejectUnauthorized?: boolean; ca?: string[]; cert?: string; key?: string }
type RedpandaSASLConfig = { mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'; username: string; password: string }
```

```ts
import { RedpandaConnector } from '@rniverse/connectors';

const rp = new RedpandaConnector({ url: 'localhost:9092' });
await rp.connect();

const producer = await rp.getProducer();
await producer.send({ topic: 'events', messages: [{ value: JSON.stringify({ e: 'signup' }) }] });
await rp.disconnect(producer);

const consumer = await rp.getConsumer({ groupId: 'g1' });
await consumer.subscribe({ topics: ['events'], fromBeginning: true });
await consumer.run({ eachMessage: async (m) => console.log(m.message.value?.toString()) });

await rp.close(); // disconnects the consumer too
```

---

## Low-level factories

Escape hatches that build the driver object without the lifecycle wrapper — same
config types as the connectors.

```ts
initORM(config: SQLConnectorConfig): DrizzleClient          // no connectivity check
initMongoDB(config: MongoDBConnectorConfig): Promise<{ client: MongoClient; db: Db }>
closeMongoDB(client: MongoClient): Promise<void>
initRedis(config: RedisConnectorConfig): GlideClientConfiguration   // the glide config object
parseRedisUrl(url: string): { host: string; port: number; useTLS: boolean;
                              credentials?: { username?: string; password: string } }
initRedpanda(config: RedpandaConnectorConfig | RedpandaConnectorURLConfig): Kafka
```

## Health check (root export)

```ts
class HealthCheck<T> {
  constructor(config: { name: string; target: { connect(); ping(): Promise<Result<T>>; close() }; health?: HealthOptions })
  check(options?: { trial?: boolean }): Promise<Result<T>>   // never throws
  get state(): BreakerState                // 'closed' | 'open' | 'half-open'
  readonly breaker: CircuitBreaker         // from @rniverse/utils/resilience
}
type HealthOptions = { attempts?: number; timeout?: number; threshold?: number; cooldown?: number }
```

Each connector owns one internally (`connector.health()` / `connector.circuit`);
you rarely construct your own. For a breaker around your own calls, use
`CircuitBreaker` from `@rniverse/utils/resilience`.

## Exported types

```
MongoDBConnectorConfig
SQLConnectorConfig · SQLConnectorURLConfig · SQLConnectorHostConfig · SQLConnectorOptionsConfig
RedisConnectorConfig · RedisConnectionURLConfig · RedisConnectionConfig · RedisConnectorOptionsConfig · RedisSetOptions
RedpandaConnectorConfig · RedpandaConnectorURLConfig · RedpandaConnectorCommonConfig · RedpandaTLSConfig · RedpandaSASLConfig
HealthOptions · HealthCheckOptions · HealthCheckConfig · HealthTarget
```

---

## Detailed guides

| Connector | Guide |
|---|---|
| SQL | [docs/sql.md](docs/sql.md) |
| MongoDB | [docs/mongodb.md](docs/mongodb.md) |
| Redis | [docs/redis.md](docs/redis.md) |
| Redpanda | [docs/redpanda.md](docs/redpanda.md) |

Full reference: **[docs/README.md](docs/README.md)** · Pending work: [docs/todo.md](docs/todo.md)
