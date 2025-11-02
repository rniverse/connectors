// lib/test/redis-comprehensive.test.ts
import { RedisConnector } from '@core/redis.connector';
import { log } from '@utils';
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

describe('Redis Comprehensive Tests', () => {
  let connector: RedisConnector;
  const testPrefix = `test:${Date.now()}`;

  beforeAll(async () => {
    connector = new RedisConnector({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  });

  afterAll(async () => {
    const client = connector.getInstance();
    if (client) {
      const keys = await client.send('KEYS', [`${testPrefix}:*`]);
      if (Array.isArray(keys) && keys.length > 0) {
        await client.del(...keys);
      }
    }
    connector.close();
  });

  test('Health Check', async () => {
    const result = await connector.health();
    expect(result.ok).toBe(true);
  });

  test('STRING - SET and GET', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:string`;
    await client.set(key, 'Hello Redis');
    const value = await client.get(key);
    expect(value).toBe('Hello Redis');
  });

  test('STRING - SET with EX (expiration)', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:expiring`;
    await client.send('SET', [key, 'temporary', 'EX', '10']);
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  test('NUMBERS - INCR and DECR', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:counter`;
    await client.set(key, '0');
    await client.incr(key);
    await client.incr(key);
    const value1 = await client.get(key);
    expect(value1).toBe('2');
    
    await client.decr(key);
    const value2 = await client.get(key);
    expect(value2).toBe('1');
  });

  test('HASH - HMSET and HMGET', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:user:1`;
    await client.hmset(key, ['name', 'Alice', 'email', 'alice@example.com', 'age', '30']);
    const values = await client.hmget(key, ['name', 'email']);
    expect(values).toEqual(['Alice', 'alice@example.com']);
  });

  test('HASH - HGET and HINCRBY', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:user:2`;
    await client.hmset(key, ['name', 'Bob', 'visits', '0']);
    await client.hincrby(key, 'visits', 1);
    await client.hincrby(key, 'visits', 1);
    const visits = await client.hget(key, 'visits');
    expect(visits).toBe('2');
  });

  test('SET - SADD and SMEMBERS', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:tags`;
    await client.sadd(key, 'javascript');
    await client.sadd(key, 'typescript');
    await client.sadd(key, 'bun');
    const members = await client.smembers(key);
    expect(members.length).toBe(3);
    expect(members).toContain('javascript');
  });

  test('SET - SISMEMBER', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:set`;
    await client.sadd(key, 'item1');
    const isMember = await client.sismember(key, 'item1');
    const notMember = await client.sismember(key, 'item2');
    expect(isMember).toBe(true);
    expect(notMember).toBe(false);
  });

  test('LIST - LPUSH and LRANGE', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:list`;
    await client.send('LPUSH', [key, 'item3', 'item2', 'item1']);
    const items = await client.send('LRANGE', [key, '0', '-1']);
    expect(items).toEqual(['item1', 'item2', 'item3']);
  });

  test('EXISTS and DEL', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:toDelete`;
    await client.set(key, 'value');
    const exists1 = await client.exists(key);
    expect(exists1).toBe(true);
    
    await client.del(key);
    const exists2 = await client.exists(key);
    expect(exists2).toBe(false);
  });

  test('EXPIRE and TTL', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const key = `${testPrefix}:expiry`;
    await client.set(key, 'value');
    await client.expire(key, 60);
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  test('CURSOR - SCAN for Keys', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    // Create multiple keys for scanning
    const keyPrefix = `${testPrefix}:scan`;
    for (let i = 0; i < 20; i++) {
      await client.set(`${keyPrefix}:${i}`, `value${i}`);
    }
    
    // Scan keys with cursor
    const scannedKeys: string[] = [];
    let cursor = 0;
    
    do {
      const result = await client.send('SCAN', [cursor.toString(), 'MATCH', `${keyPrefix}:*`, 'COUNT', '5']);
      cursor = Number(result[0]);
      const keys = result[1] as string[];
      scannedKeys.push(...keys);
    } while (cursor !== 0);
    
    expect(scannedKeys.length).toBeGreaterThanOrEqual(20);
    expect(scannedKeys.every(k => k.startsWith(keyPrefix))).toBe(true);
  });

  test('CURSOR - HSCAN for Hash Fields', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const hashKey = `${testPrefix}:hscan`;
    
    // Create hash with multiple fields
    const fields: string[] = [];
    for (let i = 0; i < 15; i++) {
      fields.push(`field${i}`, `value${i}`);
    }
    await client.hmset(hashKey, fields);
    
    // Scan hash fields with cursor
    const scannedFields: Record<string, string> = {};
    let cursor = 0;
    
    do {
      const result = await client.send('HSCAN', [hashKey, cursor.toString(), 'COUNT', '5']);
      cursor = Number(result[0]);
      const fieldValues = result[1] as string[];
      
      // Parse field-value pairs
      for (let i = 0; i < fieldValues.length; i += 2) {
        scannedFields[fieldValues[i] as string] = fieldValues[i + 1] as string;
      }
    } while (cursor !== 0);
    
    expect(Object.keys(scannedFields).length).toBe(15);
    expect(scannedFields['field0']).toBe('value0');
  });

  test('CURSOR - SSCAN for Set Members', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const setKey = `${testPrefix}:sscan`;
    
    // Create set with multiple members
    for (let i = 0; i < 25; i++) {
      await client.sadd(setKey, `member${i}`);
    }
    
    // Scan set members with cursor
    const scannedMembers: Set<string> = new Set();
    let cursor = 0;
    
    do {
      const result = await client.send('SSCAN', [setKey, cursor.toString(), 'COUNT', '10']);
      cursor = Number(result[0]);
      const members = result[1] as string[];
      members.forEach(m => scannedMembers.add(m));
    } while (cursor !== 0);
    
    expect(scannedMembers.size).toBe(25);
    expect(scannedMembers.has('member0')).toBe(true);
    expect(scannedMembers.has('member24')).toBe(true);
  });

  test('CURSOR - ZSCAN for Sorted Set', async () => {
    const client = connector.getInstance();
    if (!client) throw new Error('No client');
    
    const zsetKey = `${testPrefix}:zscan`;
    
    // Create sorted set with multiple members
    const members: string[] = [];
    for (let i = 0; i < 20; i++) {
      members.push(i.toString(), `member${i}`); // score, member
    }
    await client.send('ZADD', [zsetKey, ...members]);
    
    // Scan sorted set with cursor
    const scannedMembers: Record<string, string> = {};
    let cursor = 0;
    
    do {
      const result = await client.send('ZSCAN', [zsetKey, cursor.toString(), 'COUNT', '10']);
      cursor = Number(result[0]);
      const memberScores = result[1] as string[];
      
      // Parse member-score pairs
      for (let i = 0; i < memberScores.length; i += 2) {
        scannedMembers[memberScores[i] as string] = memberScores[i + 1] as string;
      }
    } while (cursor !== 0);
    
    expect(Object.keys(scannedMembers).length).toBe(20);
    expect(scannedMembers['member0']).toBe('0');
    expect(scannedMembers['member19']).toBe('19');
  });
});

describe('Redis Pub/Sub Tests', () => {
  test('PUBLISH and SUBSCRIBE', async () => {
    const publisher = new RedisConnector({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    const subscriber = new RedisConnector({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    
    const pubClient = publisher.getInstance();
    const subClient = subscriber.getInstance();
    
    if (!pubClient || !subClient) throw new Error('No clients');

    const channel = `test:channel:${Date.now()}`;
    const messages: string[] = [];

    const subscriberClient = await subClient.duplicate();
    
    await subscriberClient.subscribe(channel, (message) => {
      messages.push(message);
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    await pubClient.publish(channel, 'Hello');
    await pubClient.publish(channel, 'World');

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(messages).toContain('Hello');
    expect(messages).toContain('World');

    await subscriberClient.unsubscribe(channel);
    subscriberClient.close();
    publisher.close();
    subscriber.close();
  });
});
