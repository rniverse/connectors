# TODO — @rniverse/connectors

Tracking what's deferred after the 2026-09 hardening pass. Not blockers.

## Tests

`bun run docker:up` starts every service the suite needs (`docker-compose.yml`:
postgres, kafka, valkey, mongodb on offset host ports); `.env.test` points the
tests at them. `bun run test` sets `NODE_ENV=test` so `.env.test` wins over a
local `.env`.

- [ ] **Mongo / Redis / Redpanda connector-lifecycle tests** — mirror
  `sql-connector.test.ts` (connect idempotency, `appName` → identity tag,
  reconnect after close, failed-connect leaves connector unusable, `circuit`
  state, breaker trips + releases). Needs docker-compose in CI.
- [ ] **`connect()` single-pool guarantee** — `sql-connector.test.ts` only
  asserts concurrent `connect()` calls resolve; it does *not* prove a second
  pool isn't opened. Add a check against `pg_stat_activity` connection count
  for the connector's `application_name`.
- [x] **Circuit breaker `half-open`** — `health.test.ts` (fake target) and
  `sql-connector.test.ts` (real Postgres) cover open → cooldown → trial →
  reconnect → closed with a short `cooldown`.
- [ ] **Redis pub/sub** — `subscribe` / `unsubscribe` / `publish` /
  `subscriber.add()` have no coverage. Verify message delivery and that
  `subscriber.add()` clients are closed by `close()`.
- [ ] **Redis `set()` options** — cover `EX` / `PX` / `NX` / `XX` / `KEEPTTL` /
  `GET` against a live server.
- [x] **Leak canary** — `leak.test.ts` spawns a probe that does one failed
  `connect()` and then nothing; if a reconnect timer / heartbeat interval / open
  socket leaked, the probe hangs and the test times out. Findings while building
  it: Bun's `process.getActiveResourcesInfo()` / `_getActiveHandles()` are stubs
  (always `[]`), so Node-style handle snapshots don't work; and the pinned
  `postgres` / `mongodb` drivers already self-clean on a rejected `connect()`, so
  the canary passes with *or* without our `.end()` / `client.close()` in the
  catch blocks. It's a forward guard, not a proof of the current fix.
  - [ ] Add a **Redis** probe — needs a TCP listener that accepts but doesn't
    speak RESP (to hit "createClient ok, PING fails"), or a toxiproxy.
  - [ ] The "connect succeeds, then the verify step throws" sub-case (the actual
    target of the `.end()` fix) isn't reproducible against a healthy server —
    would need fault injection.
- [ ] **CI** — `docker-compose.yml` exists now (`bun run docker:up` waits for
  readiness); still to wire into a CI job.

## Known design choices (not bugs, listed so they're not "rediscovered")

- **`health()` releases the connection when the circuit opens** — after
  `threshold` (default 3) consecutive failed checks. After `cooldown` the next
  `health()` reconnects on its own; nothing else needs to call `connect()`.
- **`connect()` return types differ** — `void` (SQL, Redis), `Db` (Mongo),
  `Admin` (Redpanda). Left as-is for now.
- **Ping timeout bounds the wait, not the driver call.** `health()` stops
  waiting after `timeout`, but a driver call that ignores cancellation (kafkajs)
  keeps running in the background. kafkajs's own `connectionTimeout` (10 s) /
  `requestTimeout` (30 s) / retries still apply underneath.
- **Redis pub/sub uses RESP3 multiplexing** (glide default) — the main client
  can `subscribe()` and still run `get`/`set`. `subscriber.add()` gives a dedicated
  connection when you want isolation.

## Nice-to-have

- [x] Breaker / health settings are configurable per instance (`config.health`).
- [ ] `SQLConnector.close()` timeout could be configurable per instance rather
  than only via env / the `close({ timeout })` argument.
- [ ] `GlideClientAdapter` still exposes `send()` returning `any` and `sadd()`
  taking `...any[]` — could tighten.
