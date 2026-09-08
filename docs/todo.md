# TODO — @rniverse/connectors

Tracking what's deferred after the 2026-09 hardening pass. Not blockers.

## Tests

Only SQL and `app-name` run without spinning up services. Everything else
(`mongodb*.test.ts`, `redis.test.ts`, `redpanda.test.ts`) needs a live broker/db.

- [ ] **Mongo / Redis / Redpanda connector-lifecycle tests** — mirror
  `sql-connector.test.ts` (connect idempotency, `appName` → identity tag,
  reconnect after close, failed-connect leaves connector unusable, `circuit`
  state, breaker trips + releases). Needs docker-compose in CI.
- [ ] **`connect()` single-pool guarantee** — `sql-connector.test.ts` only
  asserts concurrent `connect()` calls resolve; it does *not* prove a second
  pool isn't opened. Add a check against `pg_stat_activity` connection count
  for the connector's `application_name`.
- [ ] **Circuit breaker `half-open`** — no test exercises the cooldown → probe
  transition (would need a fake clock or a short `CIRCUIT_COOLDOWN_MS`).
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
- [ ] **CI** — add a `docker-compose.yml` service matrix + a `pretest` that
  waits for readiness, so the full suite runs on every push.

## Known design choices (not bugs, listed so they're not "rediscovered")

- **`health()` releases the connection when the circuit opens.** With the
  default `CIRCUIT_THRESHOLD=1` this means one failed health check (after its
  own `MAX_HEALTH_RETRIES` retries) closes the pool. Raise `CIRCUIT_THRESHOLD`
  to tolerate transient blips. `connector.circuit` reports the state; a fresh
  `connect()` recovers.
- **`connect()` return types differ** — `void` (SQL, Redis), `Db` (Mongo),
  `Admin` (Redpanda). Left as-is for now.
- **No per-attempt timeout inside `ping()`.** A hung driver call makes
  `health()` hang for that attempt. `retry` has no timeout; if this bites,
  wrap `ping()` in `Promise.race` with a deadline.
- **Redis pub/sub uses RESP3 multiplexing** (glide default) — the main client
  can `subscribe()` and still run `get`/`set`. `subscriber.add()` gives a dedicated
  connection when you want isolation.

## Nice-to-have

- [ ] `SQLConnector.close()` / breaker cooldown could be configurable per
  instance rather than only via env.
- [ ] `GlideClientAdapter` still exposes `send()` returning `any` and `sadd()`
  taking `...any[]` — could tighten.
