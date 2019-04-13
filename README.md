<div align="center">
  <a href="https://github.com/bkniffler/debe">
    <img alt="flowzilla" src="https://raw.githubusercontent.com/bkniffler/debe/master/assets/logo.png" height="400px" />
  </a>
</div>
<div align="center">
  <strong>Tiny, flexible and reactive offline-first Javascript datastore for browsers, node, electron and react-native with focus on performance, simplicitiy and querying. Includes support for multi-master/client database replication via plugin.</strong>
    <br />
    <br />
  <i><small>Debe is currently under development, feel free to participate via PR or issues. Consider debe to not be production ready yet. Core API is considered pretty final, though plugin API like replication might change a bit.</small></i>
  <br />
  <br />
  <a href="https://travis-ci.org/bkniffler/debe">
    <img src="https://img.shields.io/travis/bkniffler/debe.svg?style=flat-square" alt="Build Status">
  </a>
  <a href="https://codecov.io/github/bkniffler/debe">
    <img src="https://img.shields.io/codecov/c/github/bkniffler/debe.svg?style=flat-square" alt="Coverage Status">
  </a>
  <a href="https://github.com/bkniffler/debe">
    <img src="http://img.shields.io/npm/v/debe.svg?style=flat-square" alt="Version">
  </a>
  <a href="https://github.com/bkniffler/debe">
    <img src="https://img.shields.io/badge/language-typescript-blue.svg?style=flat-square" alt="Language">
  </a>
  <a href="https://github.com/bkniffler/debe/master/LICENSE">
    <img src="https://img.shields.io/github/license/bkniffler/debe.svg?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/bkniffler/debe">
    <img src="https://flat.badgen.net/bundlephobia/minzip/debe" alt="License">
  </a>
  <a href="https://github.com/bkniffler/debe">
    <img src="https://img.shields.io/david/bkniffler/debe.svg?style=flat-square" alt="Dependencies">
  </a>
  <br />
  <br />
</div>

# Content

- [Why](#why)
- [Guides](#guides)
  - [Basic](#basic)
  - [Replication](#replication)
  - [Querying](#querying)
  - [Use](#use)
- [Bindings](#bindings)
  - [Vanilla](#vanilla)
  - [TypeScript](#typescript)
  - [React/React native hooks](#react)
- [Adapter](#adapters)
  - [Memory](#memory)
  - [Socket](#socket)
  - [Better-SQLite3](#better-sqlite3)
  - [PostgreSQL](#postgresql)
- [Development](#development)
  - [Roadmap](#roadmap)
  - [Continuous Benchmarking](#continuous-benchmarking)
- [Credits](#credits)
  - [Dependencies](#dependencies)
  - [Similar](#similar)
  - [Assets](#assets)

## Why

PouchDB/RxDB are great and very mature solutions for replicating databases, but being forced to build your services on top of CouchDB can be unfitting for some users. Debe is a fast and modern solution if you want to replicate and fetch your data in every way imaginable, so master-to-clients, master-to-masters-to-clients or master-to-client-to-master-to-client. There are multiple adapters available and implementing new ones is super simple due to the simple API surface. For a starting point, you can always take a look at memory-adapter. Also, there is a headless socket client adapter that connects to any remote debe instance to perform queries. This works great for electronJS where you might want to pipe all requests to another thread that performs the data access or for non-offline web applications that should not persist nor replicate locally.

PouchDB also stores data in a way that makes it really hard to query the underlying database directly. Debes SQL adapters store the data body as JSON type and make use of neat JSON indexing SQLite and PostgreSQL provide, so you get great performance without sacrificing flexibility of your schema or direct queryability. Also there is no need for external index tables.

Also, doing complex authorization with CouchDB is difficult, thats why the one-database-per-user approach is the most popular choice for separating data between the users. With debe and the whole data flow in Javascript/NodeJS some cool possibilities to control data access and filter & transform incoming/outgoing data according to what user tries to access it opens up.

Please note, Debe is currently not supporting relations, and probably never really will. If you're interested in relational data and graphs, you might be better off with graphQL, apollo and AppSync. Debe is focused on offline-first, performance, simplicity and being super slim.

# Guides

## Basic

https://codesandbox.io/s/5wn340ovn

```js
const { Debe } = require('debe');
const { MemoryAdapter } = require('debe-memory');

const schema = [{ name: 'lorem', index: ['name'] }];

async function work() {
  console.log('Start');
  const db = new Debe(new MemoryAdapter(), schema);
  await db.initialize();
  console.log('Initialized');
  await generateItems(db, 10000);
  const items = await db.all('lorem', {
    where: ['name < ?', 'a10']
  });
  console.log(`Fetched ${items.length} items`);
}

async function generateItems(db, numberOfItems) {
  const start = new Date().getTime();
  const items = [];
  for (let x = 0; x < numberOfItems; x++) {
    items.push({ name: 'a' + (x < 10 ? `0${x}` : x) });
  }
  await db.insert('lorem', items);
  console.log(
    `Generated ${numberOfItems} in ${new Date().getTime() - start}ms`
  );
}

work().catch(err => console.log(err));
```

## Replication

https://codesandbox.io/s/y27xmr9rvj

```js
const { Debe } = require('debe');
const { MemoryAdapter } = require('debe-memory');
const { SyncClient } = require('debe-sync');
const { SyncServer } = require('debe-sync-server');

const schema = [{ name: 'lorem', index: ['name'] }];

async function work() {
  const port = 5555;
  console.log('Start');
  // Master
  const server = await spawnServer(port);
  const client = await spawnClient(port);
  // Init
  console.log('Initialized');
  // Step1
  await generateItems(server.db, 10000);
  await generateItems(client.db, 1000);
  // Step2
  await wait(1000);
  console.log(`db0 ${await server.db.count('lorem')} items`);
  console.log(`db1 ${await client.db.count('lorem')} items`);
  console.log(
    `Was synced? ${(await client.db.count('lorem')) ===
      (await server.db.count('lorem'))}`
  );
  await server.close();
  await client.close();
}

async function spawnServer(port) {
  const db = new Debe(new MemoryAdapter(), schema);
  const server = new SyncServer(db, port);
  await server.initialize();
  return server;
}

async function spawnClient(port) {
  const db = new Debe(new MemoryAdapter(), schema);
  const sync = new SyncClient(db, ['localhost', port]);
  await db.initialize();
  return sync;
}

async function generateItems(db, numberOfItems) {
  const start = new Date().getTime();
  const items = [];
  for (let x = 0; x < numberOfItems; x++) {
    items.push({ name: 'a' + (x < 10 ? `0${x}` : x) });
  }

  await db.insert('lorem', items);
  console.log(
    `Generated ${numberOfItems} in ${new Date().getTime() - start}ms`
  );
}

async function wait(ms) {
  await new Promise(yay => setTimeout(yay, ms));
}

work().catch(err => console.log(err));
```

## Querying

Querying is simple and similar to SQL. You can subscribe to query changes by providing a callback

```tsx
// Javascript
const value = await db1.all('lorem', {
  where: ['name < ? AND lastChanged > ?', 'a50', +new Date()],
  orderBy: ['name', 'rev DESC']
});

// With Subscription
const unsubscribe = db1.all(
  'lorem',
  {
    where: ['name < ? AND lastChanged > ?', 'a50', +new Date()],
    orderBy: ['name', 'rev DESC']
  },
  value => console.log(value)
);

// Typescript
db1.all<ILorem>('lorem', {
  where: ['name < ? AND lastChanged > ?', 'a50', +new Date()],
  orderBy: ['name', 'rev DESC']
});
```

## Use

You can create a collection-scoped instance of your db.

```tsx
// Non-Scoped
await db.insert('lorem', { name: 'Lorem' });
// Scoped
const lorem = db.use('lorem');
await lorem.insert({ name: 'Lorem' });
```

# Bindings

## Vanilla

```js
import { Debe } from 'debe';
import { MemoryAdapter } from 'debe-memory';

const collections = [{ name: 'lorem', index: ['name'] }];
const db = new Debe(new MemoryAdapter(), collections);

(async function() {
  await db.initialize();
  await db.insert('lorem', { name: 'Lorem' });
  db.all('lorem', {
    where: ['name = ?', 'Lorem'],
    orderBy: ['name']
  });
})();
```

## TypeScript

```tsx
import { Debe } from 'debe';
import { MemoryAdapter } from 'debe-memory';

interface ILorem {
  name: string;
}

const collections = [{ name: 'lorem', index: ['name'] }];
const db = new Debe(new MemoryAdapter(), collections);

(async function() {
  await db.initialize();
  const lorem = db.use<ILorem>('lorem');
  await lorem.insert({ name: 'Lorem' });
  lorem.all({
    where: ['name = ?', 'Lorem'],
    orderBy: ['name']
  });
})();
```

## React

```jsx
import { Debe } from 'debe';
import { MemoryAdapter } from 'debe-memory';
import { DebeProvider, useAll } from 'debe-react';

function MyComponent(props) {
  const [result] = useAll('lorem', {
    where: ['name = ?', 'Lorem']
  });
  return (
    <ul>
      {result.map(item => (
        <li key={item.id}>
          <span>{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

const collections = [{ name: 'lorem', index: ['name'] }];
render(
  <DebeProvider
    initialize={async db => {
      await db.insert('lorem', [{ name: 'Lorem' }]);
    }}
    value={() => new Debe(new MemoryAdapter(), collections)}
    render={() => <Component />}
    loading={() => <span>Loading...</span>}
  />
);
```

# Adapters

## Memory

Universal inmemory adapter for no persistence

**Targets**

- All targets

## Socket

Universal Socket client that connects to a socket-server debe instance remotely

**Targets**

- All targets

## SQL

### SQLite

NodeJS, react-native, electron adapter that uses SQLite

**Targets**

- NodeJS
- Electron main
- React-Native

### PostgreSQL

NodeJS, electron adapter for PostgreSQL

**Targets**

- NodeJS
- Electron main

# Development

## Contributing

All contributions are welcome. Feel free to PR!

## Roadmap

All contributions welcome :)

- Middleware
  - [x] Chunk insert
  - [ ] Chunk all/fetch
- Docs
  - [ ] Write real docs :(
- Replication
  - [ ] Progress
  - [x] Chunking
  - [x] Batching
  - [ ] Conflict Resolution (automerge?)
- [x] Subscription
  - [x] Batching
- Adapters
  - [x] Memory
  - [x] Socket
  - [x] PostgreSQL
  - [x] SQLite
  - [x] Dexie
  - [x] NanoSQL
  - [ ] Raw IndexedDB
  - [ ] MongoDB
  - [ ] AWS DynamoDB
  - [ ] MS CosmosDB
  - [ ] CouchDB/Cloudant
  - [ ] RocksDB
  - [ ] Redis
- Bindings
  - [x] React
  - [ ] Vue
- Testing
  - [ ] Improve testing
  - [ ] Performance testing & benchmarking against others

## Continuous Benchmarking

This is some [basic benchmarks](./benchmark/index.ts), just to keep track of performance hits during internal changes. Minimal impacts up/down are always expected due to benchmarking inaccuracy.

![Continuous Benchmarking](./benchmark/chart.png)

# Credits

## Dependencies

- [nanoid](https://github.com/ai/nanoid)
- [asyngular](https://asyngular.io)

## Similar

- PouchDB
- RxDB
- Realm
- NanoSQL
- Google Firebase

## Assets

- Vector Graphic: [www.freepik.com](https://www.freepik.com/free-photos-vectors/background)
