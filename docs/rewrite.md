# connectors rewrite — plan

Status: **built** (steps 1–6 of §12). Where the build differed from the plan,
it's noted inline as **Built:**. **Revision 2 (§14) is built** — listeners,
extras declared in config, automatic extra connects, drivers owning recovery.
What it replaces is marked inline as **Revised (§14):**.

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
| D5 | **The owner recreates.** A connector never rebuilds an extra connection by itself; the owner hears every change through events and decides (§3.8). **Revised (§14):** a connector connects its declared extras itself; after that, each driver reconnects on its own — nobody recreates. |
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

**Revised (§14):** events become named listeners — `link.on(type, { name,
handler })` — and the `on` option is removed.

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
counts **failed checks** (not pings) against the breaker. **Revised (§14):**
opening no longer releases anything (R6–R8). Built: opening the breaker
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

**Revised (§14):** the driver brings it back; `connect()` no longer drops and
reopens (R8). Below is the built behaviour.

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
- **Revised (§14):** extras are declared in the connector's config, connect
  automatically when the connector does, and an early `connect()` logs a
  warning instead of throwing.

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
- **Revised (§14): consumer `ready` = `consumer.connect()` resolved**; the
  paragraph below is the built behaviour it replaces.
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
- ~~Recreating extra connections automatically (the owner does it, §3.8).~~
  **Revised (§14):** still out — drivers reconnect; a connector only makes the first connect of its declared extras.
- Wrapping driver APIs beyond connection lifecycle (queries, commands, publish
  stay on `getInstance()`).

## 14. Revision 2 — listeners, declared extras, drivers own recovery

Status: **built** (connectors; §14.7 step 3 — publish + migration — follows).
Deviations noted inline as **Built:**. Came out of running notify against Aiven:
extras had to be created, connected and re-connected by hand (notify's
`setup$kafka`); a consumer's `connect` event fired too late to subscribe on;
an open circuit tore down driver objects that were already reconnecting by
themselves; and nothing re-checked a dead connector unless something called
`health()`.

The principle: **drivers own reconnecting.** postgres.js opens new pool
connections, glide and the Mongo driver reconnect, kafkajs reconnects and
restarts crashed consumers. A link creates its driver object once, reports
state, and gates health — it never destroys a driver object to "recover" it.

### 14.1 Decisions

**Listeners**

| # | Decision |
|---|---|
| R1 | **Named listeners replace the `on` option.** `link.on(type, { name, handler })`, `link.off(type, { name })`. One array per event type; on the event each is called in order with the payload. |
| R2 | **A listener name is unique per link and event type** — a second `on()` with the same name throws `LinkError` `DUPLICATE_NAME` (a silent replace would hide a double registration, e.g. subscribing twice). |
| R3 | **A throwing / rejecting listener is caught and logged** with its name (`kafka/notifications: listener 'subscribe' (connect) failed`); it never breaks the link or the listeners after it. |
| R4 | **`on('connect', …)` on a link that is already `ready` runs the handler once, right away** — registration order never loses a connect. |
| R5 | **`connect` fires only when a new driver object connects** — the first connect, or a reopen after the owner's `close()`. It means "new instance — set it up" (e.g. `subscribe()` + `run()`). A link going back to `ready` on the same object (circuit closed, kafkajs restart done, Mongo heartbeat) fires **`recover`** instead. Events: `connect`, `recover`, `fail`, `close` (+ `message`, R14). |

**Circuit breaker**

| # | Decision |
|---|---|
| R6 | **An open circuit destroys nothing.** Opening: the link → `failed` (`fail` fires); `health()` fails fast until the cooldown ends. The driver object and every extra stay as they are — the driver keeps reconnecting underneath. |
| R7 | **The trial is a plain ping on the same object.** Passes → circuit closed, link `ready`, `recover` fires. `health({ trial: true })` and `breaker.open({ ms })` / `reset()` keep working — `open({ ms })` now just marks the link out of service. |
| R8 | **Removed:** the breaker's release, `connect()`'s drop-and-reopen of a failed link holding an old object, and a connector's breaker releasing its extras. `connect()` creates a driver object only when the link has none (first connect, or after `close()`); otherwise it's a no-op. An owner wanting a fresh object calls `close()` then `connect()`. |
| R9 | Trade-off, accepted: while a circuit is open `getInstance()` still returns the object, so a query waits for the driver's own timeouts instead of failing fast with `NOT_READY`. Callers that care check `state` first. |

**Extras**

| # | Decision |
|---|---|
| R10 | **Extras are declared in the connector's config** and created in its constructor; no handlers in config — the owner attaches listeners (R1). The factory methods (`producer()`, `consumer()`, `listen()`, `subscriber()`) are removed. Adding an extra at runtime is **deferred** (wanted later). |
| R11 | **The connector connects its extras** when it connects (**Built:** a direct call from the connector's state change, not an internal named listener — nothing an owner could `off()` by accident), and whenever its `health()` passes — each extra that **has no driver object yet** (never connected, or its first connect failed). An extra that has one is left to its driver; a `closed` one is skipped. |
| R12 | **An extra's `connect()` before its connector is `ready` logs a warning and returns** without connecting, naming the connector's state (`kafka/notifier: waiting — kafka is connecting`). It doesn't throw and doesn't wait; R11 connects it later. |
| R13 | **Lookups by name throw instead of returning `undefined`.** `kafka.producers`, `kafka.consumers`, `postgres.listeners`, `redis.subscribers` are read-only collections: `get(name)` returns the link or throws `LinkError` `UNKNOWN_NAME` (a name not in the config); `has()`, `size`, iteration as on a `Map`. |
| R14 | **Redis subscriber / Postgres listener messages are a `message` event** — `subscriber.on('message', { name, handler })` — same reason as R10. Payloads unchanged (Postgres: parsed JSON else string; Redis: `{ channel, pattern?, message }`). |

| R18 | **An extra's state follows its connector down and back — state only.** Connector → `failed`: each `ready` / `connecting` extra → `failed` (`fail` fires, nothing torn down) — e.g. kafkajs sends no producer event on broker loss, so without this `producer.state` stays `ready` and a publish waits out kafkajs's retries. Connector → `ready` again (`recover`): each extra it took down goes back to the state it had (`recover` fires for `ready`). |

**Kafka**

| # | Decision |
|---|---|
| R15 | **Consumer `ready` = `consumer.connect()` resolved** (like the producer); `connect` fires then (R5) and the owner does `subscribe()` + `run()` in its listener — exactly once per consumer object. |
| R16 | **kafkajs owns consumer recovery; we never restart a consumer.** Its default `restartOnFailure` is kept. `CRASH` with `restart: true` → `connecting`; the next `GROUP_JOIN` → `ready` (`recover`). `CRASH` with `restart: false` (non-retriable — auth, authorization) → `failed`, and it stays failed: a restart wouldn't help, the owner decides. `REBALANCING` is logged, not a state. **Built:** kafkajs disconnects *before* emitting `CRASH`, so `DISCONNECT` alone maps to `connecting`, not `failed` — the `CRASH` that follows decides; otherwise every restart would fire a spurious `fail`. Stop a consumer with `close()`, not the raw `disconnect()`. |

**Recovery timer**

| # | Decision |
|---|---|
| R17 | **Optional `recover: { every }`** (ms) on a connector. Each pass: no driver object yet → `connect()` (bounded by the driver's own connection timeout, not the 2 s health timeout — a slow first connect, ~4 s against Aiven, isn't reported as failed health checks); otherwise `health()` (which also connects never-connected extras, R11). Starts at the first `connect()`, stops on `close()`; passes never overlap; `unref`'d. Option → env `RECOVER_EVERY_MS` → default **off**. |

### 14.2 Surface

```ts
type LinkEventMap = {
  connect: { name: string };                   // a new driver object connected
  recover: { name: string };                   // back to ready, same object
  fail: { name: string; error: unknown };
  close: { name: string };
};

abstract class Link<Instance, Events extends LinkEventMap = LinkEventMap> {
  on<T extends keyof Events>(type: T, listener: {
    name: string;
    handler: (event: Events[T]) => unknown;
  }): void;
  off<T extends keyof Events>(type: T, options: { name: string }): void;
  // …everything else as §3.3, minus the `on` option
}

type LinkOptions = { name: string; health?: HealthOptions };
type ConnectorOptions = LinkOptions & { recover?: { every?: number } };

/** Read-only, by name. get() throws UNKNOWN_NAME. */
interface Links<T> extends Iterable<T> {
  get(name: string): T;
  has(name: string): boolean;
  readonly size: number;
}

type KafkaConfig = ConnectorOptions & {
  brokers: string | string[];
  // …as §8
  producers?: (LinkOptions & Partial<ProducerConfig>)[];
  consumers?: (LinkOptions & ConsumerConfig)[];
};
type PostgresConfig = ConnectorOptions & {
  // …as §5
  listeners?: (LinkOptions & { channel: string })[];
};
type RedisConfig = ConnectorOptions & {
  // …as §6
  subscribers?: (LinkOptions & { channels?: string[]; patterns?: string[] })[];
};

class PostgresListener extends Link<ListenMeta, LinkEventMap & { message: unknown }> {}
class RedisSubscriber extends Link<GlideClient, LinkEventMap & {
  message: { channel: string; pattern?: string; message: string };
}> {}
```

`LinkErrorCode` gains `UNKNOWN_NAME`.

### 14.3 What an owner writes (notify)

```ts
// connections/kafka.connection.ts
export const kafka = new KafkaConnector({
  name: 'kafka', appName, brokers, ssl, sasl,
  recover: { every: 30_000 },
  producers: [{ name: 'notifier' }],
  consumers: [{ name: 'notifications', groupId }],
});

// consumers/index.ts
const consumer = kafka.consumers.get('notifications');
consumer.on('connect', {
  name: 'subscribe',
  handler: async () => {
    const instance = consumer.getInstance();
    await instance.subscribe({ topic });
    await instance.run({ eachMessage });
  },
});

// services/notification/publish.ts
const producer = kafka.producers.get('notifier');
if (producer.state !== 'ready') { /* pending row */ }
```

No supervisor, no manual `connect()` of extras, no re-subscribing.

### 14.4 `@rniverse/shared` registry

- **Optional connections connect in the background** — `init()` starts their
  `connect()` without awaiting, logs a failure as a warning. Required ones are
  awaited as today (failure still exits). "Optional never blocks boot" is the
  registry's rule, not each service's.
- **`init()` no longer runs a health check** and returns `void` (neither aham
  nor notify reads its result). Health runs only on demand (`/api/health`).

### 14.5 Migration

| Repo | Change |
|---|---|
| notify | Kafka as §14.3; `recover.every` from `KAFKA_RECOVER_EVERY`; the registry lists the real `kafka` connector (`required: false`) — the no-op-connect adapter and `connections/setup/kafka.setup.ts` are removed |
| aham | dependency bump only (Postgres, no extras) |

### 14.6 Tests

- `test/shared/` — listeners: order, payload, `DUPLICATE_NAME`, `off`, a
  throwing / rejecting listener isolated and logged, R4 replay; `connect` vs
  `recover` (R5); circuit open keeps the object and extras, fails health fast,
  trial ping recovers (R6–R8); extras: connect with the connector, `closed`
  skipped, early `connect()` warns without throwing or connecting, `health()`
  connecting a never-connected extra; `UNKNOWN_NAME`; `recover.every` (connect
  when no object, health otherwise, no overlap, stops on `close()`).
- `test/kafka/` — consumer `ready` on connect; owner subscribes in `connect`
  and receives a message; broker restart → consumer `connecting` → `ready`
  (`recover`) with no re-subscribe, message still received; producer connects
  with the connector.
- `test/postgres/`, `test/redis/` — `message` event delivers; declared
  listener / subscriber connect with the connector.
- shared — registry: optional connect doesn't block `init()`, required still
  awaited, `init()` runs no health check.
- notify — the Docker smoke scenarios from its spec §8 (broker down at boot,
  later up, restarted mid-run, SIGINT).

### 14.7 Build order

1. connectors `lib/shared/` — listeners + events (R1–R5), breaker without
   teardown (R6–R9), extras (R10–R13), recovery timer (R17); tests.
2. Kafka (R15, R16), Postgres + Redis (R14), Mongo (`recover` from heartbeat);
   tests; README.
3. Publish connectors; publish shared (§14.4); migrate notify (§14.5), bump
   aham; smoke tests; refresh the graph.
