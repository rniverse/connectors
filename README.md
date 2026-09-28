# @rniverse/connectors

Connection lifecycle for **PostgreSQL** (drizzle + postgres.js), **Redis /
Valkey** (glide), **MongoDB** and **Kafka / Redpanda** (kafkajs) — one model
for all four: every live connection is a **link** with the same state, events,
health check, circuit breaker and manual controls.

This file is the SDK reference. Design and rationale:
[`docs/rewrite.md`](docs/rewrite.md).

---

## Install

```bash
bun add github:rniverse/connectors#dist
```

Install only the peers for the connectors you use:

| peer | version | for |
|---|---|---|
| `@rniverse/utils` | `github:rniverse/utils#dist` | always |
| `drizzle-orm` + `postgres` | `^0.45.2` / `^3.4.9` | `PostgresConnector` |
| `@valkey/valkey-glide` | `^2.5.2` | `RedisConnector` |
| `mongodb` | `^7.6.0` | `MongoConnector` |
| `kafkajs` | `^2.2.4` | `KafkaConnector` |

### Entry points

| import | loads |
|---|---|
| `@rniverse/connectors/postgres` | `PostgresConnector`, `PostgresListener` — drizzle + postgres only |
| `@rniverse/connectors/redis` | `RedisConnector`, `RedisSubscriber` — glide only |
| `@rniverse/connectors/mongo` | `MongoConnector` — mongodb only |
| `@rniverse/connectors/kafka` | `KafkaConnector`, `KafkaProducer`, `KafkaConsumer` — kafkajs only |
| `@rniverse/connectors/shared` | `Link`, `Connector`, `LinkError`, `HealthCheck`, shared types |
| `@rniverse/connectors` | everything (loads every driver) |

Every connector subpath also re-exports `LinkError` and the shared types.

---

## The model

**One connector = one connection target**: a Postgres database, a Redis
server + database number, a Mongo cluster, a Kafka cluster. Another target →
another connector.

A **link** is anything holding a live connection: every connector, and every
extra connection it opens — a Postgres listener, a Redis subscriber, a Kafka
producer or consumer. Extra connections are created **through their
connector**, so they're tracked, health-checked and closed with it:

```ts
const kafka = new KafkaConnector({ name: 'main', brokers: process.env.KAFKA_BOOTSTRAP_SERVERS! });
await kafka.connect();

const producer = kafka.producer({ name: 'notifier' });
await producer.connect();
await producer.getInstance().send({ topic, messages });   // raw kafkajs Producer

kafka.getInstance();   // raw kafkajs Kafka, for anything not wrapped
```

### Every link

```ts
link.name                 // required; unique within its connector
link.state                // 'idle' | 'connecting' | 'ready' | 'failed' | 'closed'
link.connect()            // idempotent; a close() mid-connect wins
link.close()              // closes its extra connections first, then itself
link.ping()               // one raw check → Result; never throws
link.health({ trial? })   // reconnect + time-limited, retried ping + breaker → Result; never throws
link.getInstance()        // raw driver object (see below)
link.circuit              // 'closed' | 'open' | 'half-open'
link.breaker              // CircuitBreaker from @rniverse/utils/resilience
```

**State**

| State | Means |
|---|---|
| `idle` | created, never connected |
| `connecting` | connecting or reconnecting; a Kafka consumer also sits here until it joins its group |
| `ready` | connected and able to do its job |
| `failed` | connect or health check failed, the driver reported a failure, or a breaker released the connection |
| `closed` | the owner called `close()` — never the breaker's doing |

Kafka producers / consumers and Mongo report changes live (driver events).
Postgres and Redis have no connection events: their state is "as of the last
`connect()` / `ping()` / `health()`" — call `health()` for current truth.

**Events** — `on: { connect, fail, close }` in any link's options:

```ts
const consumer = kafka.consumer({
  name: 'notifications',
  groupId: 'notify',
  on: {
    connect: () => log.info('joined — receiving'),          // ready: first time, or after a reconnect
    fail: ({ error }) => log.warn({ error }, 'consumer failed'),
  },
});
```

Every breaker change already shows up as one of these (opening releases the
connection → `fail`; the trial reconnecting → `connect` or `fail`). A handler
that throws never breaks the link.

**`getInstance()`** works as soon as the driver object exists — once
`connect()` has resolved — **whatever the state**. It throws `LinkError`
`NOT_READY` only when there's no object (before the first `connect()`, after
`close()`, after a breaker released the connection). That's what lets a Kafka
consumer call `subscribe()` + `run()` before it's `ready`.

**Health check** — each `health()`: reconnect if needed (a no-op while
connected), ping with a time limit, retry, and count **failed checks** (not
pings) against the breaker. After `threshold` failed checks the circuit opens:
the connection is released (`failed`), extra connections too, and `health()`
fails fast (`CircuitOpenError`) until `cooldown` passes. The next `health()` is
the trial — it reconnects; success closes the circuit. **A connector recovers on
its own; nothing else has to call `connect()`.**

**Manual control**

| Owner wants to | Call |
|---|---|
| Take it out of service | `link.breaker.open({ ms })` — releases the connection → `failed` |
| Put it back now | `link.breaker.reset()` — the next `health()` / `connect()` reconnects |
| Test it now, skipping the cooldown | `link.health({ trial: true })` |
| Inspect | `link.state`, `link.circuit`, `link.breaker.failures`, `link.breaker.remaining` |

**Bringing a failed link back** — call `connect()` again on the same object: it
drops the old driver object and opens a fresh one (same name, config, handlers).
Or `close()` it (freeing the name) and create a new one with different config.
When a connector's own breaker releases it, its extra connections go `failed`
too (names kept); the owner reconnects them, e.g. from the connector's
`connect` event.

**Errors** — `LinkError` with a stable `code`:

| `code` | When |
|---|---|
| `DUPLICATE_NAME` | an extra connection's name is taken within its connector (a closed one frees it) |
| `NOT_READY` | no driver object — `getInstance()` / `ping()` too early or after close; an extra connection's `connect()` before its connector's |
| `MISSING_APP_NAME` | neither `config.appName` nor `INSTANCE_NAME` is set |

`error.link` and `error.connector` name the link.

---

## Settings

Every setting: explicit option → env var → default.

| Setting | Option | Env var | Default |
|---|---|---|---|
| App name shown to the server | `appName` | `INSTANCE_NAME` | **none — required** (`MISSING_APP_NAME`) |
| Pings per health check | `health.attempts` | `MAX_HEALTH_RETRIES` | 3 |
| Ping timeout | `health.timeout` | `HEALTH_TIMEOUT_MS` | 2000 ms |
| Failed checks to open the circuit | `health.threshold` | `CIRCUIT_THRESHOLD` | 3 |
| Circuit cooldown | `health.cooldown` | `CIRCUIT_COOLDOWN_MS` | 30000 ms |
| Postgres close grace | `closeTimeout` | `SQL_CLOSE_TIMEOUT_S` | 5 s |

Extra connections use their connector's `health` settings unless given their
own. URLs are handed to the driver as given — never parsed.

---

## PostgresConnector — `/postgres`

```ts
new PostgresConnector<TSchema>({
  name: string,
  url?: string,                       // and / or fields — fields override the URL's parts
  host?, port?, database?, user?, password?,
  pool?: { max?: 20, idleTimeout?: 30, connectionTimeout?: 30, maxLifetime?: 3600 },   // seconds
  prepare?: boolean,                  // default true
  schema?: TSchema,                   // drizzle schema → db.query.* relational queries
  appName?: string,                   // application_name
  closeTimeout?: number,              // seconds
  connection?: Record<string, string | number | boolean>,   // raw server settings
  health?, on?,
})
```

| member | |
|---|---|
| `getInstance()` | drizzle db (typed by `schema`); `$client` is postgres.js |
| `listen({ name, channel, onMessage })` | → `PostgresListener` on its own connection; payload parsed as JSON when it parses, else the raw string |
| `listeners` | `ReadonlyMap<string, PostgresListener>` |

`ping()`: `SELECT 1`. A listener re-LISTENs by itself after a dropped
connection (postgres.js) and goes `ready` again; postgres.js exposes no state
for that connection, so a listener's `ping()` checks the pool. `NOTIFY`: plain
`getInstance().$client.notify(...)`.

## RedisConnector — `/redis`

```ts
new RedisConnector({
  name: string,
  host: string, port: number,         // fields only: glide takes no URL
  tls?: boolean, tlsInsecure?: boolean,
  credentials?: { username?: string, password: string },
  database?: number,                  // logical DB, default 0
  requestTimeout?: 10000, connectionTimeout?: 10000,   // ms
  appName?: string,                   // CLIENT SETNAME
  health?, on?,
})
```

| member | |
|---|---|
| `getInstance()` | the glide `GlideClient` — use glide's API directly |
| `subscriber({ name, channels?, patterns?, onMessage })` | → `RedisSubscriber` on its own client; `onMessage({ channel, pattern?, message })` |
| `subscribers` | `ReadonlyMap<string, RedisSubscriber>` |

Standalone servers only. Glide fixes subscriptions when the client is created —
changing channels means a new subscriber. `ping()`: `PING`.

## MongoConnector — `/mongo`

```ts
new MongoConnector({
  name: string,
  url: string,
  database?: string,                  // default for db()
  appName?: string,
  options?: { maxPoolSize?: 10, minPoolSize?: 2, connectTimeoutMS?: 10000, socketTimeoutMS?: 45000,
              serverSelectionTimeoutMS?: 10000, retryWrites?: true, retryReads?: true },
  health?, on?,
})
```

| member | |
|---|---|
| `getInstance()` | the `MongoClient` |
| `db(name?)` | a `Db` on the same pool — default `database`, else the URL's |

No extra connections. `ping()`: `admin().ping()`. State follows the driver's
server heartbeats.

## KafkaConnector — `/kafka`

```ts
new KafkaConnector({
  name: string,
  brokers: string | string[],         // an array, or a comma-separated string
  appName?: string,                   // kafkajs clientId
  connectionTimeout?: 10000, requestTimeout?: 30000,   // ms
  ssl?: boolean | { rejectUnauthorized?, ca?, cert?, key? },
  sasl?: { mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512', username, password },
  kafka?: Partial<KafkaConfig>,       // raw kafkajs settings, applied last
  health?, on?,
})
```

| member | |
|---|---|
| `getInstance()` | the kafkajs `Kafka` |
| `admin()` | the connector's own admin connection |
| `producer({ name, ...ProducerConfig })` | → `KafkaProducer`; `ready` on connect |
| `consumer({ name, groupId, ...ConsumerConfig })` | → `KafkaConsumer`; `ready` only after joining its group |
| `producers`, `consumers` | `ReadonlyMap`s by name |

A consumer is `connecting` from `connect()` until the owner's `subscribe()` +
`run()` make it join its group; a rebalance takes it back to `connecting`; a
crash or disconnect → `failed`. kafkajs keeps its own retries / timeouts
underneath; `health.timeout` bounds our wait, not kafkajs's calls.

---

## Tests

```bash
bun run docker:up     # postgres, kafka, valkey, mongodb (docker-compose.yml)
bun run test          # NODE_ENV=test → .env.test points at those services
bun run docker:down
```

Tests live in `test/`, mirroring `lib/`: `shared/` (the link model, with a fake
driver) and one folder per connector against the real services.
