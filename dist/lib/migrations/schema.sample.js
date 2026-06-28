// lib/migrations/schema.sample.ts
// Sample Drizzle schema — copy and adapt for your tables.
import { boolean, integer, pgTable, serial, text, timestamp, } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    age: integer('age'),
    active: boolean('active').default(true),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});
//# sourceMappingURL=schema.sample.js.map