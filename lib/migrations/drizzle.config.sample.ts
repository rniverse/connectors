// lib/migrations/drizzle.config.sample.ts
// Copy this file and adapt for each database schema.
//
// Usage:
//   bun run db:generate --config=lib/migrations/myapp.config.ts
//   bun run db:migrate  --config=lib/migrations/myapp.config.ts
//   bun run db:push     --config=lib/migrations/myapp.config.ts

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './lib/migrations/schema.sample.ts', // path to your schema file(s)
	out: './lib/migrations/out', // where generated SQL migrations go
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	verbose: true,
	strict: true,
});
