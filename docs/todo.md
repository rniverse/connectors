# TODO — @rniverse/connectors

Deferred after the 2026-09 rewrite. Not blockers.

## Tests

`bun run docker:up` + `bun run test` run the whole suite against real services
(`docker-compose.yml`, `.env.test`).

- [ ] **CI** — run the compose stack + `bun run test` on every push.
- [ ] **Redis subscriber leak probe** — `test/shared/leak.test.ts` covers
  Postgres and Mongo failed connects; Redis needs a TCP listener that accepts
  but doesn't speak RESP (or a toxiproxy) to hit "client created, PING fails".
- [ ] **Postgres listener outage** — a test that drops the LISTEN connection
  server-side (`pg_terminate_backend`) and asserts postgres.js re-listens and
  the listener goes `ready` again.

## Known limits (not bugs — listed so they're not "rediscovered")

- **Postgres / Redis state lags between checks** — neither driver publishes
  connection events; `state` is as of the last `connect()` / `ping()` /
  `health()`.
- **Postgres listener `ping()` checks the pool, not the LISTEN socket** —
  postgres.js exposes no state for that connection.
- **Kafka producer `ping()` reports state only** — kafkajs has no producer-level
  ping and reconnects to brokers lazily on the next send.
- **Health timeout bounds our wait, not the driver's call** — kafkajs keeps its
  own `connectionTimeout` / `requestTimeout` / retries underneath.
- **Redis cluster mode** (`GlideClusterClient`) is out of scope.
