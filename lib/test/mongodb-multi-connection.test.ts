// lib/test/mongodb-multi-connection.test.ts
// Test to verify multiple MongoDB connections work correctly (no singleton)

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { MongoDBConnector } from '@core/mongodb.connector';
import type { MongoDBConnectorConfig } from '../types/mongodb.type';

describe('MongoDB Multi-Connection Tests', () => {
  let connector1: MongoDBConnector;
  let connector2: MongoDBConnector;
  const host = '192.168.29.249';
  const port = 6017;
  
  const config1: MongoDBConnectorConfig = {
    url: `mongodb://${host}:${port}/test_db_1`,
    database: 'test_db_1',
  };
  
  const config2: MongoDBConnectorConfig = {
    url: `mongodb://${host}:${port}/test_db_2`,
    database: 'test_db_2',
  };

  beforeAll(async () => {
    // Create two separate MongoDB connectors to different databases
    connector1 = new MongoDBConnector(config1);
    connector2 = new MongoDBConnector(config2);
    
    // Wait for both to initialize
    await Promise.all([
      connector1.ping(),
      connector2.ping(),
    ]);
  });

  afterAll(async () => {
    // Clean up test collections
    await connector1.dropCollection('users');
    await connector2.dropCollection('users');
    
    // Close both connections
    await connector1.close();
    await connector2.close();
  });

  test('Two connectors should connect to different databases', async () => {
    const db1 = connector1.getInstance();
    const db2 = connector2.getInstance();
    
    expect(db1).not.toBeNull();
    expect(db2).not.toBeNull();
    expect(db1?.databaseName).toBe('test_db_1');
    expect(db2?.databaseName).toBe('test_db_2');
  });

  test('Data written to one database should not appear in the other', async () => {
    // Insert data into database 1
    await connector1.insertOne('users', { name: 'Alice', age: 30 });
    
    // Insert data into database 2
    await connector2.insertOne('users', { name: 'Bob', age: 25 });
    
    // Verify database 1 has only Alice
    const db1Result = await connector1.find('users', {});
    expect(db1Result.ok).toBe(true);
    expect(db1Result.data?.length).toBe(1);
    const alice = db1Result.data?.[0];
    expect(alice).toBeDefined();
    expect(alice?.name).toBe('Alice');
    
    // Verify database 2 has only Bob
    const db2Result = await connector2.find('users', {});
    expect(db2Result.ok).toBe(true);
    expect(db2Result.data?.length).toBe(1);
    const bob = db2Result.data?.[0];
    expect(bob).toBeDefined();
    expect(bob?.name).toBe('Bob');
  });

  test('Operations on one connector should not affect the other', async () => {
    // Count docs in both databases
    const count1Before = await connector1.countDocuments('users', {});
    const count2Before = await connector2.countDocuments('users', {});
    
    expect(count1Before.count).toBe(1);
    expect(count2Before.count).toBe(1);
    
    // Delete from database 1
    await connector1.deleteMany('users', {});
    
    // Verify database 1 is empty
    const count1After = await connector1.countDocuments('users', {});
    expect(count1After.count).toBe(0);
    
    // Verify database 2 still has data
    const count2After = await connector2.countDocuments('users', {});
    expect(count2After.count).toBe(1);
  });
});
