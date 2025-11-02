// lib/test/data/schema.drizzle.ts
import { pgTable, serial, varchar, integer, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  age: integer('age'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
}));

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productName: varchar('product_name', { length: 100 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  orderDate: timestamp('order_date').defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_orders_user_id').on(table.userId),
}));

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  stock: integer('stock').default(0),
}, (table) => ({
  categoryIdx: index('idx_products_category').on(table.category),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
}));
