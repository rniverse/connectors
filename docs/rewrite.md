# connectors rewrite — plan

Status: **built** (steps 1–6 of §12). Where the build differed from the plan,
it's noted inline as **Built:**.

## 1. Summary

Today: four connector classes, each with its own ad-hoc lifecycle, spread
across `core/`, `tools/`, `types/` and per-subpath re-export files, with extra
connections (Kafka producers / consumers, Redis subscribers) half-managed and
invisible to health checks.

After: **one model for everything that holds a live connection** — a *link*.
Every connector is a link; every extra connection a connector opens is a link.
All links share one surface: state, events, health check, circuit breaker,
manual control. Code is grouped per connector.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **One connector = one connection target**: a Postgres database, a Redis server + database number, a Mongo cluster, a Kafka cluster. Another target → another connector. |
| D2 | **A link is anything holding a live connection** — every connector, and every extra connection it opens (Kafka producer / consumer, Redis subscriber, Postgres listener). |
| D3 | **Extra connections are created through their connector** (`kafka.producer(...)`), never through the raw driver object — so they're tracked, health-checked, and closed with the connector. `getInstance()` still returns the raw driver object for anything we don't wrap. |
| D4 | **Each link has its own state, health check and breaker.** A crashed consumer fails alone; its Kafka connector stays `ready`. |
| D5 | **The owner recreates.** A connector never rebuilds an extra connection by itself; the owner hears every change through events and decides (§3.8). |
| D6 | **Names by protocol:** `PostgresConnector` (was `SQLConnector`), `RedisConnector` (Valkey too), `MongoConnector` (was `MongoDBConnector`), `KafkaConnector` (was `RedpandaConnector` — Redpanda speaks Kafka). |
| D7 | **Redis exposes glide directly.** `GlideClientAdapter` is removed. Standalone `GlideClient` only; cluster mode is out of scope. |
| D8 | **Postgres `listen` and Redis `subscriber` are built now.** |
| D9 | **Every link has a required `name`**, unique within its connector; duplicates throw (§3.5). |
| D10 | **`url` and fields go to the driver as given — never parsed.** A connector takes a `url`, fields, or both, and hands them to the driver unchanged. It never pulls host / port / credentials out of a URL. A driver that can't take a URL gets no `url` option. |
| D11 | **Every connector must have an `appName`**: `config.appName`, else `INSTANCE_NAME`. No default — neither set → `LinkError` `MISSING_APP_NAME`. |
| D12 | **Settings: explicit option → env var → default**, via one resolver (§9). `appName` is the one setting with no default. |
| D13 | **Options objects, never bare positional flags / numbers** — in public and internal signatures alike. |
| D14 | **Types beside their code**; generic pieces in `lib/shared/`, parallel to `lib/core/`. |

## 3. Shared — `lib/shared/`

### 3.1 State

```ts
type LinkState = 'idle' | 'connecting' | 'ready' | 'failed' | 'closed';
```

| State | Means |
|---|---|
| `idle` | created, never connected |
| `connecting` | connect in progress, or reconnecting |
| `ready` | connected and able to do its job |
| `failed` | connect or health check failed, the driver reported a crash, or a breaker released the connection |
| `closed` | the **owner** called `close()` — never the breaker's doing |

How changes are noticed:

- **Live, from driver events:** Kafka producer / consumer (kafkajs
  `CONNECT`, `DISCONNECT`, `CRASH`, `REBALANCING`, `GROUP_JOIN`), Mongo
  (`MongoClient` topology / heartbeat events).
- **Only from our checks:** Postgres pool and Redis — postgres.js and glide
  publish no connection events. There, `state` is "as of the last `connect()` /
  `ping()` / `health()`"; call `health()` for current truth. Postgres listener:
  `ready` on postgres.js's (re)listen callback, failures only via `ping()`.

### 3.2 Events

```ts
type LinkEvents = {
  connect?: (event: { name: string }) => void;                // → ready (first time or again)
  fail?: (event: { name: string; error: unknown }) => void;   // → failed
  close?: (event: { name: string }) => void;                  // → closed (owner's close)
};
```

No separate breaker event: every breaker change already appears as a state
change — opening releases the connection (`failed` → `fail`); the trial
reconnects (`connecting`, then `ready` → `connect`, or `failed` → `fail`). The
owner reads `link.circuit` / `link.breaker` for the *why*.

### 3.3 The link surface

```ts
type LinkOptions = {
  name: string;
  health?: HealthOptions;   // §9
  on?: LinkEvents;
};

abstract class Link<Instance> {
  readonly name: string;
  get state(): LinkState;
  get circuit(): BreakerState;              // 'closed' | 'open' | 'half-open'
  get breaker(): CircuitBreaker;            // from @rniverse/utils/resilience (§3.6)
  connect(): Promise<void>;                 // idempotent (lazy); a close() mid-connect wins
  close(): Promise<void>;
  ping(): Promise<Result<unknown>>;         // one raw check — no retry, no breaker
  health(options?: { trial?: boolean }): Promise<Result<unknown>>;  // reconnect + retry + breaker; never throws
  getInstance(): Instance;                  // raw driver object (§3.7)

  // each concrete link implements only these:
  protected abstract __open(): Promise<Instance>;
  protected abstract __shut(options: { instance: Instance }): Promise<void>;
  protected abstract __ping(options: { instance: Instance }): Promise<Result<unknown>>;
}
```

The base class owns everything common: `lazy` connect, the close-during-connect
guard, state and events, `HealthCheck`, breaker, `trial`. A concrete link only
says how to open, shut and ping its driver.

Extra connections use their connector's `health` settings unless given their
own.

### 3.4 Health check

As built in the current release, moved here from `tools/`: each `health()`
reconnects (a no-op while connected), pings with a time limit, retries, and
counts **failed checks** (not pings) against the breaker. Opening the breaker
releases the connection; after the cooldown the next `health()` is the trial and
reconnects on its own. `health({ trial: true })` runs the trial now.

### 3.5 Names and errors

- `name` is required on every link.
- **Unique within one connector, across all its extra connections** (a producer
  and a consumer on one Kafka connector can't share a name — events carry only
  the name).
- **No cross-connector check** — that would need process-wide state.
- **A `closed` link frees its name**; a `failed` link keeps it.
- Errors are one class:

```ts
class LinkError extends Error {
  readonly code: 'DUPLICATE_NAME' | 'NOT_READY' | 'MISSING_APP_NAME';
  readonly link: string;        // the link's name (not `name` — Error.name is 'LinkError')
  readonly connector: string;   // the connector's name
}
```

### 3.6 Manual control

Every link, connector or extra connection alike:

| Owner wants to | Call |
|---|---|
| Take it out of service | `link.breaker.open({ ms })` — releases the connection → `failed` → `fail`; `health()` fails fast until `ms` passes |
| Put it back now | `link.breaker.reset()` — circuit closed; the next `health()` / `connect()` reconnects |
| Test it now, skipping the cooldown | `link.health({ trial: true })` — reconnect + ping as the single trial |
| Inspect | `link.state`, `link.circuit`, `link.breaker.failures`, `link.breaker.remaining` |

### 3.7 `getInstance()` vs `state`

`getInstance()` works as soon as the driver object exists — once `connect()` has
resolved — **whatever the `state`**. It throws `NOT_READY` only when there's no
object: before the first `connect()`, after `close()`, or after a breaker
released the connection.

`state` answers "can it do its job right now". They must differ because a Kafka
consumer reaches `ready` only after joining its group, which only happens after
the owner calls `subscribe()` + `run()` on `getInstance()`.

### 3.8 Bringing a failed link back

- **Usually: call `connect()` again on the same object.** It opens a fresh driver
  connection — same name, config, handlers, still in its connector's map.
  **Built:** if the link still holds its old driver object (the driver reported
  the failure), `connect()` drops it first; a `health()` check never does —
  only the breaker releases a connection. E.g.
  in the Kafka connector's `connect` handler: `await producer.connect()`.
- **Or: `close()` it and create a new one** — when the owner wants different
  config. `close()` frees the name first.

### 3.9 Connectors and their extras

Every connector:

- tracks its extra connections by name in read-only maps
  (`postgres.listeners`, `redis.subscribers`, `kafka.producers`,
  `kafka.consumers`);
- on `close()`, closes its extras first, then itself;
- when its own breaker opens, marks each extra `failed` and closes it (each
  fires `fail`) — applies to Postgres, Redis and Kafka; Mongo has no extras;
- an extra's `connect()` needs its connector's driver object — before the
  connector has connected it throws `NOT_READY`.

## 4. Layout

```
lib/
  shared/       link.ts · health.ts · errors.ts · setting.ts · shared.type.ts · index.ts
  core/
    postgres/   postgres.connector.ts · postgres.listener.ts · postgres.helper.ts · postgres.type.ts · index.ts
    redis/      redis.connector.ts · redis.subscriber.ts · redis.helper.ts · redis.type.ts · index.ts
    mongo/      mongo.connector.ts · mongo.helper.ts · mongo.type.ts · index.ts
    kafka/      kafka.connector.ts · kafka.producer.ts · kafka.consumer.ts · kafka.helper.ts · kafka.type.ts · index.ts
  index.ts      — root barrel (loads every driver; prefer subpaths)
test/           — repo root: shared/ · postgres/ · redis/ · mongo/ · kafka/
```

- **Helpers** are plain functions that build driver config from our config —
  no classes, no URL parsing — private to their folder.
- **Subpaths** (`package.json` exports): `./postgres`, `./redis`, `./mongo`,
  `./kafka`, each → its folder's `index.ts`; `./shared` for the link types.
  Importing one subpath loads only that driver. `./sql`, `./mongodb`,
  `./redpanda` are removed.
- **Removed:** `lib/tools/`, `lib/types/`, the four subpath re-export files,
  `GlideClientAdapter`, `parseRedisUrl`, the public `init*` helpers.
- **Kept:** `docker-compose.yml`, `.env.test`, `docker:up` / `docker:down`,
  `bun run test` with `NODE_ENV=test`.

## 5. Postgres — `core/postgres/`

```ts
// postgres.js takes a URL, fields, or both — `postgres(url, options)`, fields
// overriding the URL's parts. Passed through as given; `url` or `host` required.
type PostgresConfig = LinkOptions & {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  pool?: { max?: number; idleTimeout?: number; connectionTimeout?: number; maxLifetime?: number };  // seconds
  prepare?: boolean;
  schema?: Record<string, unknown>;     // drizzle schema → relational queries (db.query.users.findMany)
  appName?: string;                     // application_name — required (D11)
  closeTimeout?: number;                // seconds; env SQL_CLOSE_TIMEOUT_S; default 5
  connection?: Record<string, string | number | boolean>;   // raw server settings
};

class PostgresConnector<TSchema extends Record<string, unknown> = Record<string, never>>
  extends Link<PostgresJsDatabase<TSchema>> {                // drizzle db, typed by schema
  listen(options: {
    name: string;
    channel: string;
    onMessage: (payload: unknown) => void;   // parsed JSON when it parses, else the raw string
  } & Partial<LinkOptions>): PostgresListener;
  readonly listeners: ReadonlyMap<string, PostgresListener>;
}

class PostgresListener extends Link<ListenMeta> {}   // postgres.js LISTEN on its own connection
```

- `ping()`: `SELECT 1`. Listener `ping()`: **Built:** checks the connector's
  pool — postgres.js exposes no state for the LISTEN connection (`ListenMeta`
  has only `unlisten()`); it re-LISTENs by itself and calls back, which marks
  the listener `ready` again.
- `NOTIFY`: plain drizzle / `$client` — no wrapper.

## 6. Redis / Valkey — `core/redis/`

```ts
// glide has no URL input (GlideClient.createClient takes addresses, credentials,
// tls, databaseId — checked against @valkey/valkey-glide 2.x). Parsing a URL is
// ruled out (D10), so fields only.
type RedisConfig = LinkOptions & {
  host: string;
  port: number;
  tls?: boolean;
  credentials?: { username?: string; password: string };
  database?: number;                  // logical DB, default 0
  requestTimeout?: number;            // ms, default 10000
  connectionTimeout?: number;         // ms, default 10000
  tlsInsecure?: boolean;
  appName?: string;                   // CLIENT SETNAME — required (D11)
};

class RedisConnector extends Link<GlideClient> {
  subscriber(options: {
    name: string;
    channels?: string[];
    patterns?: string[];
    onMessage: (message: { channel: string; pattern?: string; message: string }) => void;
  } & Partial<LinkOptions>): RedisSubscriber;
  readonly subscribers: ReadonlyMap<string, RedisSubscriber>;
}

class RedisSubscriber extends Link<GlideClient> {}   // its own GlideClient
```

- `ping()`: `PING` (valid on a subscribed connection too).
- Glide fixes subscriptions when the client is created: a subscriber's channels
  / patterns are set up front; changing them = a new subscriber.
- Publishing and every other command: glide's own API on `getInstance()`.

## 7. Mongo — `core/mongo/`

```ts
// The Mongo driver takes a connection string plus options — both passed through.
type MongoConfig = LinkOptions & {
  url: string;
  database?: string;                  // default for db(); else the URL's, else the driver's ('test')
  appName?: string;                   // required (D11)
  options?: {
    maxPoolSize?: number; minPoolSize?: number; connectTimeoutMS?: number;
    socketTimeoutMS?: number; serverSelectionTimeoutMS?: number;
    retryWrites?: boolean; retryReads?: boolean;
  };
};

class MongoConnector extends Link<MongoClient> {
  db(name?: string): Db;              // same pool; default = config.database
}
```

- `ping()`: `admin().ping()`.
- No extra connections — a database is a name on the same pool, not a link.

## 8. Kafka / Redpanda — `core/kafka/`

```ts
// kafkajs takes a broker list: `brokers` is that list as-is, or a comma-separated
// string (e.g. KAFKA_BOOTSTRAP_SERVERS), split on ',' and trimmed.
type KafkaConfig = LinkOptions & {
  brokers: string | string[];
  appName?: string;                   // kafkajs clientId — required (D11)
  connectionTimeout?: number;         // ms, default 10000
  requestTimeout?: number;            // ms, default 30000
  ssl?: KafkaTLSConfig;
  sasl?: KafkaSASLConfig;
  kafka?: Partial<KafkaJsConfig>;     // raw kafkajs overrides, applied last
};

class KafkaConnector extends Link<Kafka> {          // kafkajs Kafka
  admin(): Admin;                                    // the connector's own connection
  producer(options: { name: string } & Partial<ProducerConfig> & Partial<LinkOptions>): KafkaProducer;
  consumer(options: { name: string } & ConsumerConfig & Partial<LinkOptions>): KafkaConsumer;
  readonly producers: ReadonlyMap<string, KafkaProducer>;
  readonly consumers: ReadonlyMap<string, KafkaConsumer>;
}

class KafkaProducer extends Link<Producer> {}
class KafkaConsumer extends Link<Consumer> {}
```

- Connector `ping()`: `admin.listTopics()`.
- Producer: `ready` on `CONNECT`, `failed` on `DISCONNECT`; `ping()` =
  `state === 'ready'`.
- **Consumer: `ready` only after joining its group** (`GROUP_JOIN`) — when it can
  actually receive messages, i.e. after the owner's `subscribe()` + `run()`.
  Between `connect()` and joining it's `connecting`; `REBALANCING` → back to
  `connecting`; `CRASH` → `failed`. A check during a rebalance fails; the
  default `threshold: 3` absorbs it. After a reconnect the owner re-does
  `subscribe()` + `run()` on the consumer's `connect` event.
- kafkajs keeps its own retries / timeouts underneath; our health `timeout`
  bounds our wait, not kafkajs's calls.

## 9. Settings

One resolver (`lib/shared/setting.ts`): explicit option → env var → default.

| Setting | Option | Env var | Default |
|---|---|---|---|
| Pings per health check | `health.attempts` | `MAX_HEALTH_RETRIES` | 3 |
| Ping timeout | `health.timeout` | `HEALTH_TIMEOUT_MS` | 2000 ms |
| Failed checks to open | `health.threshold` | `CIRCUIT_THRESHOLD` | 3 |
| Circuit cooldown | `health.cooldown` | `CIRCUIT_COOLDOWN_MS` | 30000 ms |
| Identity tag | `appName` | `INSTANCE_NAME` | **none** — `MISSING_APP_NAME` |
| Postgres close grace | `closeTimeout` | `SQL_CLOSE_TIMEOUT_S` | 5 s |

## 10. Tests — `test/` at the repo root

- `test/shared/` — `Link` with a fake driver: every state transition and its
  event; `getInstance()` rules; duplicate-name / missing-app-name / not-ready
  errors; close-during-connect; `health()` recovery; `trial`; manual
  `open` / `reset`; a connector's breaker closing its extras; option → env →
  default resolution.
- `test/postgres/` — connect, ping, recovery; a listener receives a `NOTIFY`
  (JSON and plain-string payloads); `schema` enables relational queries;
  existing drizzle query tests.
- `test/redis/` — connect, ping, recovery; a subscriber receives a `PUBLISH`
  (channel and pattern); existing command coverage rewritten against glide.
- `test/mongo/` — connect, `db(name)` on one pool, existing CRUD tests.
- `test/kafka/` — producer → consumer round trip; consumer `ready` only after
  `GROUP_JOIN`; a crashed consumer fails alone; existing pattern tests.
- All against the compose services; `bun run test` runs everything; lint and
  `tsc` clean; the build runs on Node.

## 11. Migration

| Consumer | Change |
|---|---|
| `shared` registry | `KafkaConnector`; producers / consumers created as links via `kafka.producer()` / `kafka.consumer()`; consumers re-`subscribe()` + `run()` on their `connect` event; health per link; registry health gets a per-connector timeout; a consumer failing to connect no longer kills startup |
| `aham` | `SQLConnector` → `PostgresConnector` from `/postgres`; config shape (`pool.*`); set `INSTANCE_NAME` |
| `notify` | Postgres as aham; `RedpandaConnector` → `KafkaConnector` from `/kafka`; `url` → `brokers` (the env string as-is); config types renamed; set `INSTANCE_NAME` |
| connectors docs | **Built:** README is the full SDK reference; the old per-connector guides (`docs/sql.md` etc.) are removed; `docs/todo.md` refreshed |

## 12. Build order

Each step ends with its tests green, lint and `tsc` clean, before the next
starts. Work on one branch in connectors; nothing is published until step 7.

1. **Shared** — `Link`, `HealthCheck` (moved), `LinkError`, setting resolver,
   types; `test/shared/` with a fake driver.
2. **Postgres** — connector, listener, helper, types; tests; aham's usage
   checked against it.
3. **Redis** — connector, subscriber; tests.
4. **Mongo** — connector; tests.
5. **Kafka** — connector, producer, consumer; tests.
6. **Package** — exports, root barrel, removals (§4), README + docs.
7. **Publish** connectors (`main` → `dist`), refresh the graph.
8. **Migrate** `shared`, then `aham` and `notify` (§11); each repo's tests green;
   publish `shared`; refresh the graph.

## 13. Out of scope

- Redis cluster mode (`GlideClusterClient`).
- Recreating extra connections automatically (the owner does it, §3.8).
- Wrapping driver APIs beyond connection lifecycle (queries, commands, publish
  stay on `getInstance()`).
