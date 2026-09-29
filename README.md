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
extra connection of one — a Postgres listener, a Redis subscriber, a Kafka
producer or consumer. Extra connections are **declared in their connector's
config**: created with it, connected once it's ready, closed with it.

```ts
const kafka = new KafkaConnector({
  name: 'kafka',
  brokers: process.env.KAFKA_BOOTSTRAP_SERVERS!,
  recover: { every: 30_000 },
  producers: [{ name: 'notifier' }],
  consumers: [{ name: 'notifications', groupId: 'notify' }],
});

const consumer = kafka.consumers.get('notifications');
consumer.on('connect', {
  name: 'subscribe',
  handler: async () => {
    await consumer.getInstance().subscribe({ topic });
    await consumer.getInstance().run({ eachMessage });
  },
});

await kafka.connect();          // connects the producer and consumer too

const producer = kafka.producers.get('notifier');
if (producer.state === 'ready') {
  await producer.getInstance().send({ topic, messages });   // raw kafkajs Producer
}
kafka.getInstance();            // raw kafkajs Kafka, for anything not wrapped
```

**The driver owns reconnecting.** postgres.js opens new pool connections,
glide and the Mongo driver reconnect, kafkajs reconnects and restarts crashed
consumers. A link creates its driver object once, reports state, and gates
health — it never destroys a driver object to "recover" it.

### Every link

```ts
link.name                     // required; unique within its connector
link.state                    // 'idle' | 'connecting' | 'ready' | 'failed' | 'closed'
link.connect()                // creates + connects the driver object; a no-op once there is one
link.close()                  // closes its extra connections first, then itself
link.ping()                   // one raw check → Result; never throws
link.health({ trial? })       // time-limited, retried ping + breaker → Result; never throws
link.getInstance()            // raw driver object (see below)
link.on(type, { name, handler })   // named listener
link.off(type, { name })
link.circuit                  // 'closed' | 'open' | 'half-open'
link.breaker                  // CircuitBreaker from @rniverse/utils/resilience
```

**State**

| State | Means |
|---|---|
| `idle` | created, never connected |
| `connecting` | connect in progress, or the driver is reconnecting (a kafkajs consumer restart) |
| `ready` | connected and able to do its job |
| `failed` | connect or health check failed, the driver reported a failure, the circuit opened, or its connector failed |
| `closed` | the owner called `close()` |

Kafka producers / consumers and Mongo report changes live (driver events).
Postgres and Redis have no connection events: their state is "as of the last
`connect()` / `ping()` / `health()`" — call `health()` for current truth.

**Events** — named listeners, called in registration order with the payload:

| Event | Fires when | Payload |
|---|---|---|
| `connect` | a **new driver object** connected — set it up here (e.g. subscribe) | `{ name }` |
| `recover` | back to `ready` on the **same** object (circuit closed, kafkajs restart done, heartbeat back) | `{ name }` |
| `fail` | → `failed` | `{ name, error }` |
| `close` | → `closed` (the owner's close) | `{ name }` |
| `message` | Postgres listener / Redis subscriber only — each message | see below |

A second listener with the same name for the same event throws
`DUPLICATE_NAME`. A listener that throws or rejects is logged by name and never
breaks the link or the listeners after it. `on('connect', …)` on a link that's
already `ready` runs the handler once, right away — registration order never
loses a connect.

**`getInstance()`** works as soon as the driver object exists — once
`connect()` has resolved — **whatever the state**. It throws `LinkError`
`NOT_READY` only when there's no object (before the first `connect()`, after
`close()`).

**Health check** — each `health()`: connect if there's no driver object yet,
ping with a time limit, retry, and count **failed checks** (not pings) against
the breaker. After `threshold` failed checks the circuit opens: the link goes
`failed` and `health()` fails fast (`CircuitOpenError`) until `cooldown` passes
— **nothing is torn down**, the driver keeps reconnecting underneath. The next
`health()` is the trial: a plain ping on the same object; success closes the
circuit, `ready` again (`recover`). A connector whose check passes also
connects its extras that have no driver object yet.

**Recover timer** — `recover: { every }` on a connector (ms; env
`RECOVER_EVERY_MS`; default off): from the first `connect()` until `close()`,
each pass connects while there's no driver object (bounded by the driver's own
connect timeout, not the health timeout), else runs `health()`. Passes never
overlap. Without it, something must call `health()` for a down connector to be
noticed back.

**Manual control**

| Owner wants to | Call |
|---|---|
| Take it out of service | `link.breaker.open({ ms })` — `failed` now; `health()` fails fast until `ms` passes |
| Put it back now | `link.breaker.reset()` — the next `health()` pings and brings it back |
| Test it now, skipping the cooldown | `link.health({ trial: true })` |
| A fresh driver object | `link.close()` then `link.connect()` — `connect` fires again |
| Inspect | `link.state`, `link.circuit`, `link.breaker.failures`, `link.breaker.remaining` |

### Extra connections

- **Declared in the connector's config**, created in its constructor. Adding
  one at runtime isn't supported yet.
- **Looked up by name** — `kafka.producers`, `kafka.consumers`,
  `postgres.listeners`, `redis.subscribers` are read-only collections:
  `get(name)` returns the link or throws `UNKNOWN_NAME`; `has()`, `size` and
  iteration as on a `Map`. Names are unique across one connector's extras.
- **Connected by their connector** when it connects, and when its `health()`
  passes — each extra that has no driver object yet. One that has one is left
  to its driver; a `closed` one is skipped (the owner closed it on purpose).
- **An extra's `connect()` before its connector is `ready`** logs a warning
  (`kafka/notifier: waiting — kafka is connecting`) and returns — no throw,
  no wait; the connector connects it later.
- **Their state follows the connector down and back — state only.** Connector
  → `failed`: each `ready` / `connecting` extra → `failed` (`fail`), nothing
  torn down. Connector `ready` again: each goes back to what it was (`recover`).
  An extra's own driver report wins over that.
- Extras use their connector's `health` settings unless given their own.

**Errors** — `LinkError` with a stable `code`:

| `code` | When |
|---|---|
| `DUPLICATE_NAME` | two extras of one connector share a name, or a listener name is taken for that event |
| `UNKNOWN_NAME` | `get(name)` for a name not in the connector's config |
| `NOT_READY` | no driver object — `getInstance()` / `ping()` before the first connect or after close |
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
| Recover timer | `recover.every` | `RECOVER_EVERY_MS` | off |
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
  listeners?: { name: string, channel: string, health? }[],
  health?, recover?,
})
```

| member | |
|---|---|
| `getInstance()` | drizzle db (typed by `schema`); `$client` is postgres.js |
| `listeners.get(name)` | → `PostgresListener`, LISTEN on its own connection; each NOTIFY is a `message` event — payload parsed as JSON when it parses, else the raw string |

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
  subscribers?: { name: string, channels?: string[], patterns?: string[], health? }[],
  health?, recover?,
})
```

| member | |
|---|---|
| `getInstance()` | the glide `GlideClient` — use glide's API directly |
| `subscribers.get(name)` | → `RedisSubscriber` on its own client; each message is a `message` event: `{ channel, pattern?, message }` |

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
  health?, recover?,
})
```

| member | |
|---|---|
| `getInstance()` | the `MongoClient` |
| `db(name?)` | a `Db` on the same pool — default `database`, else the URL's |

No extra connections. `ping()`: `admin().ping()`. State follows the driver's
server heartbeats (a failed one → `failed`, the next good one → `recover`).

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
  producers?: { name: string, health?, ...ProducerConfig }[],
  consumers?: { name: string, groupId: string, health?, ...ConsumerConfig }[],
  health?, recover?,
})
```

| member | |
|---|---|
| `getInstance()` | the kafkajs `Kafka` |
| `admin()` | the connector's own admin connection |
| `producers.get(name)` | → `KafkaProducer`; `ready` on connect |
| `consumers.get(name)` | → `KafkaConsumer`; `ready` on connect — subscribe + run in its `connect` listener |

**kafkajs owns consumer recovery.** After a crash it restarts the same consumer
with its subscription and `run()` (its default `restartOnFailure`): the link
goes `connecting`, then `ready` again on the next group join (`recover`) — no
second `connect`, no re-subscribing. A crash kafkajs won't restart
(non-retriable, or `restartOnFailure` said no) → `failed`, and it stays failed:
the owner decides (`close()` + `connect()` for a fresh consumer). kafkajs
disconnects before reporting a crash, so a `DISCONNECT` alone is `connecting`;
stop a consumer with `close()`, not the raw `disconnect()`. A rebalance is
logged, not a state. `health.timeout` bounds our wait, not kafkajs's calls.

---

## Tests

```bash
bun run docker:up     # postgres, kafka, valkey, mongodb (docker-compose.yml)
bun run test          # NODE_ENV=test → .env.test points at those services
bun run docker:down
```

Tests live in `test/`, mirroring `lib/`: `shared/` (the link model, with a fake
driver) and one folder per connector against the real services.
