// lib/test/sql-drizzle.test.ts
import { SQLConnector } from '@core/sql.connector';
import { log } from '@utils';
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { users, orders, products } from './data/schema.drizzle';
import { eq, gt, and, sql, desc, asc, avg, count, sum } from 'drizzle-orm';

describe('SQL Drizzle ORM Tests', () => {
  let connector: SQLConnector;
  
  beforeAll(async () => {
    connector = new SQLConnector({ url: process.env.POSTGRES_TEST_URL || '' });
    const client = connector.getInstance();
    
    if (!client) {
      throw new Error('Failed to initialize SQL connector');
    }

    const schemaSQL = readFileSync(join(__dirname, 'data/schema.sql'), 'utf-8');
    await client.$client.unsafe(schemaSQL);
    
    const seedSQL = readFileSync(join(__dirname, 'data/seed.sql'), 'utf-8');
    await client.$client.unsafe(seedSQL);
    
    log.info('Database initialized for Drizzle tests');
  });

  afterAll(async () => {
    const client = connector.getInstance();
    if (client) {
      await client.$client`DROP TABLE IF EXISTS orders CASCADE`;
      await client.$client`DROP TABLE IF EXISTS products CASCADE`;
      await client.$client`DROP TABLE IF EXISTS users CASCADE`;
    }
  });

  test('Health Check', async () => {
    const result = await connector.health();
    expect(result.ok).toBe(true);
  });

  test('SELECT - All Users', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const allUsers = await client.select().from(users);
    expect(allUsers.length).toBeGreaterThan(0);
    expect(allUsers[0]).toHaveProperty('username');
    expect(allUsers[0]).toHaveProperty('email');
  });

  test('SELECT - With WHERE Clause', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select()
      .from(users)
      .where(eq(users.username, 'alice'));
    
    expect(result.length).toBe(1);
    expect(result[0]?.username).toBe('alice');
  });

  test('SELECT - With Multiple Conditions', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select()
      .from(users)
      .where(and(gt(users.age, 25), eq(users.username, 'bob')));
    
    expect(result.length).toBeGreaterThanOrEqual(0);
    if (result.length > 0) {
      expect(result[0]?.username).toBe('bob');
    }
  });

  test('SELECT - With ORDER BY', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select()
      .from(users)
      .orderBy(desc(users.age));
    
    expect(result.length).toBeGreaterThan(0);
    // Verify ordering
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]?.age).toBeGreaterThanOrEqual(result[i]?.age || 0);
    }
  });

  test('SELECT - With LIMIT', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select()
      .from(users)
      .limit(2);
    
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('INSERT - Single Record', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const username = `drizzle_user_${Date.now()}`;
    const email = `${username}@test.com`;
    
    const result = await client
      .insert(users)
      .values({
        username,
        email,
        age: 28,
      })
      .returning();
    
    expect(result.length).toBe(1);
    expect(result[0]?.username).toBe(username);
    expect(result[0]?.email).toBe(email);
    expect(result[0]?.age).toBe(28);
  });

  test('INSERT - Multiple Records', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const timestamp = Date.now();
    const result = await client
      .insert(users)
      .values([
        {
          username: `multi_user1_${timestamp}`,
          email: `multi1_${timestamp}@test.com`,
          age: 30,
        },
        {
          username: `multi_user2_${timestamp}`,
          email: `multi2_${timestamp}@test.com`,
          age: 35,
        },
      ])
      .returning();
    
    expect(result.length).toBe(2);
    expect(result[0]?.age).toBe(30);
    expect(result[1]?.age).toBe(35);
  });

  test('UPDATE - Single Record', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .update(users)
      .set({ age: 27 })
      .where(eq(users.username, 'alice'))
      .returning();
    
    expect(result.length).toBe(1);
    expect(result[0]?.age).toBe(27);
    expect(result[0]?.username).toBe('alice');
  });

  test('UPDATE - Multiple Records', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .update(users)
      .set({ age: 40 })
      .where(gt(users.age, 35))
      .returning();
    
    expect(result.length).toBeGreaterThanOrEqual(0);
    if (result.length > 0) {
      expect(result[0]?.age).toBe(40);
    }
  });

  test('DELETE - Single Record', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const username = `delete_user_${Date.now()}`;
    const email = `${username}@test.com`;
    
    await client.insert(users).values({ username, email, age: 99 });
    
    const result = await client
      .delete(users)
      .where(eq(users.username, username))
      .returning();
    
    expect(result.length).toBe(1);
    expect(result[0]?.username).toBe(username);
  });

  test('JOIN - Inner Join', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        username: users.username,
        email: users.email,
        productName: orders.productName,
        quantity: orders.quantity,
        price: orders.price,
      })
      .from(users)
      .innerJoin(orders, eq(users.id, orders.userId));
    
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('username');
    expect(result[0]).toHaveProperty('productName');
  });

  test('JOIN - Left Join', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        userId: users.id,
        username: users.username,
        orderId: orders.id,
        productName: orders.productName,
      })
      .from(users)
      .leftJoin(orders, eq(users.id, orders.userId));
    
    expect(result.length).toBeGreaterThan(0);
  });

  test('AGGREGATE - COUNT', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({ count: count() })
      .from(users);
    
    expect(Number(result[0]?.count)).toBeGreaterThan(0);
  });

  test('AGGREGATE - AVG and SUM', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        avgPrice: avg(orders.price),
        totalQuantity: sum(orders.quantity),
      })
      .from(orders);
    
    expect(result.length).toBe(1);
    expect(result[0]?.avgPrice).not.toBeNull();
  });

  test('GROUP BY - With Aggregates', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        userId: orders.userId,
        totalOrders: count(),
        totalSpent: sum(orders.price),
      })
      .from(orders)
      .groupBy(orders.userId);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('userId');
    expect(result[0]).toHaveProperty('totalOrders');
  });

  test('SUBQUERY - In WHERE Clause', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const avgAge = client.select({ value: avg(users.age) }).from(users);
    
    const result = await client
      .select()
      .from(users)
      .where(gt(users.age, sql`(${avgAge})`));
    
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  test('TRANSACTION - Commit', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const username = `tx_user_${Date.now()}`;
    const email = `${username}@test.com`;
    
    await client.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ username, email, age: 45 })
        .returning();
      
      if (!user) throw new Error('Failed to create user');
      
      await tx.insert(orders).values({
        userId: user.id,
        productName: 'Transaction Test Product',
        quantity: 1,
        price: '99.99',
      });
    });
    
    const result = await client
      .select()
      .from(users)
      .where(eq(users.username, username));
    
    expect(result.length).toBe(1);
    expect(result[0]?.username).toBe(username);
  });

  test('TRANSACTION - Rollback on Error', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const username = `tx_rollback_${Date.now()}`;
    const email = `${username}@test.com`;
    
    try {
      await client.transaction(async (tx) => {
        await tx.insert(users).values({ username, email, age: 50 });
        
        // Force an error - duplicate username
        await tx.insert(users).values({ username, email: `other_${email}`, age: 51 });
      });
    } catch (error) {
      // Expected error
    }
    
    const result = await client
      .select()
      .from(users)
      .where(eq(users.username, username));
    
    // Transaction should have rolled back
    expect(result.length).toBe(0);
  });

  test('RAW SQL - Using sql template', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        username: users.username,
        upperUsername: sql<string>`UPPER(${users.username})`,
      })
      .from(users)
      .limit(1);
    
    expect(result.length).toBe(1);
    expect(result[0]?.upperUsername).toBe(result[0]?.username.toUpperCase());
  });

  test('DISTINCT - Select Unique Values', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .selectDistinct({ category: products.category })
      .from(products);
    
    expect(result.length).toBeGreaterThan(0);
  });

  test('WINDOW FUNCTION - Using sql', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const result = await client
      .select({
        username: users.username,
        age: users.age,
        rank: sql<number>`ROW_NUMBER() OVER (ORDER BY ${users.age} DESC)`,
      })
      .from(users);
    
    expect(result.length).toBeGreaterThan(0);
    expect(Number(result[0]?.rank)).toBe(1);
  });

  test('CTE - WITH Clause', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const userSpending = client
      .$with('user_spending')
      .as(
        client
          .select({
            userId: orders.userId,
            total: sql<number>`SUM(${orders.price}::numeric * ${orders.quantity})`.as('total'),
          })
          .from(orders)
          .groupBy(orders.userId)
      );
    
    const result = await client
      .with(userSpending)
      .select({
        username: users.username,
        totalSpent: userSpending.total,
      })
      .from(users)
      .innerJoin(userSpending, eq(users.id, userSpending.userId));
    
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('username');
    expect(result[0]).toHaveProperty('totalSpent');
  });

  test('UPSERT - ON CONFLICT DO UPDATE', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const username = `upsert_user_${Date.now()}`;
    const email = `${username}@test.com`;
    
    // First insert
    await client
      .insert(users)
      .values({ username, email, age: 25 })
      .onConflictDoNothing();
    
    // Upsert - update age
    const result = await client
      .insert(users)
      .values({ username, email, age: 30 })
      .onConflictDoUpdate({
        target: users.username,
        set: { age: 30 },
      })
      .returning();
    
    expect(result.length).toBe(1);
    expect(result[0]?.age).toBe(30);
  });
});
