import {
  ICollection,
  IItem,
  IQuery,
  IInsert,
  IMiddleware2,
  IMiddlewareInner,
  ICollections,
  actionTypes,
  IListenerOptions,
  listenTypes,
  IObserverCallback,
  IInsertItem,
  IGetItem,
  fieldTypes
} from './types';
import { IObject, generate, chunkSequencial, chunkParallel } from './utils';
import { DebeDispatcher } from './dispatcher';
import { Debe } from './debe';
import { changeListenerPlugin, softDeletePlugin } from './middleware';
import { DebeAdapter } from './adapter';

interface IBackendOptions {
  middlewares?: IMiddleware2[];
  changeListener?: boolean;
  softDelete?: boolean;
  [s: string]: any;
}
export class DebeBackend<TBase = IItem> extends DebeDispatcher {
  chunks = 1000000;
  chunkMode = 'parallel';
  options: IBackendOptions;
  collections: IObject<ICollection> = {};
  middlewares: IMiddlewareInner[] = [];
  db: Debe;
  adapter: DebeAdapter;
  constructor(
    db: Debe,
    adapter: DebeAdapter,
    collections: ICollections,
    options: IBackendOptions = {}
  ) {
    super();
    this.collections = collections;
    this.options = options;
    const {
      middlewares = [],
      changeListener = true,
      softDelete = false
    } = options;
    this.db = db;
    this.adapter = adapter;
    if (changeListener) {
      this.middlewares.push(changeListenerPlugin(options as any)(db));
    }
    if (softDelete) {
      this.middlewares.push(softDeletePlugin(options as any)(db));
    }
    for (var middleware of middlewares) {
      this.middlewares.push(middleware(db));
    }
  }
  run(action: actionTypes, collection: string, payload?: any, options?: any) {
    if (this[action]) {
      return this[action].apply(this, [collection, payload, options]);
    }
    throw new Error('Method does not exist: ' + action);
  }
  listen<T>(
    action: listenTypes,
    callback: (value: T) => void,
    options: IListenerOptions
  ) {
    return this.listener(action, callback, options);
  }
  private collection(name: string) {
    return this.collections[name];
  }
  async close() {
    await this.adapter.close();
  }
  async initialize() {
    this.options = { idField: this.options.idField || 'id' };
    for (var middleware of this.middlewares) {
      if (middleware.collections) {
        middleware.collections(this.collections);
      }
    }
    for (var key in this.collections) {
      this.collections[key].fields[this.options.idField] = fieldTypes.STRING;
      this.collections[key].index[this.options.idField] = fieldTypes.STRING;
      this.collections[key].specialFields.id = this.options.idField;
      for (var middleware of this.middlewares) {
        if (middleware.collection) {
          middleware.collection(this.collections[key]);
        }
      }
    }
    this.collections = this.collections;
    await this.adapter.initialize(this.collections, this.options);
  }

  transformItemIn<T = TBase>(
    collection: ICollection,
    item: T,
    options: IInsert
  ) {
    const { idField } = this.options;
    if (!item) {
      return item;
    }
    if (item[idField] === undefined || item[idField] === null) {
      item[idField] = generate();
      options.new.push(item[idField]);
    } else {
      options.existing.push(item[idField]);
    }
    if (typeof item[idField] !== 'string') {
      item[idField] = item[idField] + '';
    }
    for (var middleware of this.middlewares) {
      if (middleware.transformItemIn) {
        item = middleware.transformItemIn<T>(collection, item);
      }
    }
    return item;
  }
  transformItemOut<T = TBase>(collection: ICollection, item: T) {
    for (var middleware of this.middlewares) {
      if (middleware.transformItemOut) {
        item = middleware.transformItemOut<T>(collection, item);
      }
    }
    return item;
  }
  listener<T = TBase>(
    type: listenTypes,
    callback: IObserverCallback<T>,
    options: IListenerOptions
  ) {
    for (var middleware of this.middlewares) {
      if (middleware.listener) {
        return middleware.listener<T>(type, options, callback);
      }
    }
    throw new Error('No listener attached');
  }
  private query(collection: ICollection, value: IQuery) {
    for (var middleware of this.middlewares) {
      if (middleware.query) {
        value = middleware.query(collection, value);
      }
    }
    return value;
  }
  async insert<T = TBase>(
    collection: string,
    value: (T & IInsertItem)[],
    options: IInsert
  ): Promise<(T & IGetItem)[]> {
    const chunks = this.adapter.chunks || this.chunks;
    const chunkMode = this.adapter.chunkMode || this.chunkMode;
    if (chunks && value.length > chunks) {
      return (chunkMode === 'sequencial' ? chunkSequencial : chunkParallel)<
        T & IInsertItem,
        T & IGetItem
      >(value, chunks, items => this.insert(collection, items, { ...options }));
    }

    if (!options.new) {
      options.new = [];
      options.existing = [];
    }

    const c = this.collection(collection);
    let input = value.map(x => this.transformItemIn(c, x, options));
    for (var middleware of this.middlewares) {
      if (middleware.beforeInsert) {
        const result = middleware.beforeInsert(c, input, options);
        if (result && (await result)) {
          input = (await result) as any;
        }
      }
    }

    const result = await this.adapter.insert(c, input, options);
    const transformed = result.map(x => this.transformItemOut(c, x));
    for (var middleware of this.middlewares) {
      if (middleware.afterInsert) {
        middleware.afterInsert(c, input, options, transformed);
      }
    }
    return result;
  }
  async remove(collection: string, value: string[]): Promise<string[]> {
    const c = this.collection(collection);
    for (var middleware of this.middlewares) {
      if (middleware.beforeRemove) {
        const v = middleware.beforeRemove(c, value) as any;
        if (v && v.then && (await v)) {
          return await v;
        }
      }
    }
    const result = await this.adapter.remove(c, value);
    for (var middleware of this.middlewares) {
      if (middleware.afterRemove) {
        middleware.afterRemove(c, value, result);
      }
    }
    return result;
  }
  async all<T = TBase>(
    collection: string,
    value: IQuery
  ): Promise<(T & IGetItem)[]> {
    const c = this.collection(collection);
    value = this.query(c, value);
    const result = await this.adapter.all(c, value);
    return this.transformItemOut(c, result);
  }
  async count(collection: string, value: IQuery): Promise<number> {
    const c = this.collection(collection);
    value = this.query(c, value);
    const result = await this.adapter.count(c, value);
    return result;
  }
  async get<T = TBase>(
    collection: string,
    value: string
  ): Promise<T & IGetItem> {
    const c = this.collection(collection);
    const result = await this.adapter.get(c, value);
    return this.transformItemOut(c, result);
  }
}