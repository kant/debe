import { Sqlite3Debe } from './better-sqlite3';
import { generate } from '../utils';
import { join } from 'path';
import { removeSync, ensureDirSync } from 'fs-extra';
const sqlite3 = require('better-sqlite3');

const dbDir = join(__dirname, '../../../../.temp/better-sqlite3');
removeSync(dbDir);
ensureDirSync(dbDir);
const getDBDir = () => join(dbDir, generate() + '.db');
test('sqlite3:basic', async () => {
  const client = new Sqlite3Debe(
    [
      {
        name: 'lorem',
        index: ['name']
      }
    ],
    {
      sqlite3Db: sqlite3(getDBDir())
    }
  );
  await client.initialize();
  const insertResult = await client.insert<any>('lorem', {
    id: 0,
    name: 'Hallo'
  });
  const queryResult = await client.all<any>('lorem');
  expect(insertResult.id).toBe('0');
  expect(insertResult.name).toBe('Hallo');
  expect(Array.isArray(queryResult)).toBe(true);
  expect(queryResult.length).toBe(1);
  expect(queryResult[0].id).toBe(insertResult.id);
  expect(queryResult[0].name).toBe(insertResult.name);
});

test('sqlite3:many', async () => {
  const client = new Sqlite3Debe(
    [
      {
        name: 'lorem',
        index: ['goa']
      }
    ],
    {
      sqlite3Db: sqlite3(getDBDir())
    }
  );
  await client.initialize();
  const items = [];
  for (let x = 0; x < 100; x++) {
    items.push({ goa: 'a' + (x < 10 ? `0${x}` : x) });
  }
  client.insert('lorem', items);
  const queryResult = await client.all<any>('lorem');
  const queryResult2 = await client.all<any>('lorem', {
    where: ['goa < ?', 'a50']
  });
  expect(Array.isArray(queryResult)).toBe(true);
  expect(queryResult.length).toBe(100);
  expect(queryResult2.length).toBe(50);
});
