import { EventEmitter } from 'events';
import {
  IObserverCallback,
  IInsertOptions,
  IAllQuery,
  IItem,
  IGetItem,
  IInsertItem,
  ISQLightClientUse
} from '@sqlight/types';
import { isEqual, ensureArray } from '../utils';

export interface IDefaultColumns {
  id: string;
  rev: string;
  body: string;
  removed: string;
}
export interface IColumn {
  name: string;
  type: 'text' | 'number';
}
export interface ISQLightSQLEngineOptions {
  verbose?: boolean;
  defaultColumnNames?: IDefaultColumns;
  additionalColumns?: IColumn[];
}
export interface IModelCreate {
  name: string;
  index?: string[];
  columns?: string[];
}

export interface IModel {
  name: string;
  index: string[];
  columns: string[];
}

export class SQLightClient<TBase = IItem> {
  engine: SQLightEngine;
  constructor(engine: SQLightEngine) {
    this.engine = engine;
    // this.isReady = new Promise(yay => this.connect().then(yay));
  }
  public destroy() {
    return this.engine.destroy();
  }
  public connect() {
    return this.engine.connect();
  }
  public use<T = IItem>(model: string): ISQLightClientUse<T> {
    const proxy = this;
    return new Proxy<any>(
      {},
      {
        get: function(t: string, methodName: string) {
          return (...args: [any]) => {
            return proxy[methodName](model, ...args);
          };
        }
      }
    );
  }
  private query<T>(
    m: IModel | string,
    queryArgs: IAllQuery = {},
    queryType: 'all' | 'get' | 'count',
    cb?: IObserverCallback<T>
  ): Promise<T> | (() => void) {
    const model = this.engine.getModel(m);
    if (cb) {
      let lastResult: any = undefined;
      const listener = async () => {
        let isInitial = lastResult === undefined;
        let newValue = await this.engine.query<T>(model, queryArgs, queryType);
        // Check is results changed
        if (isEqual(lastResult, newValue as any, this.engine.revField)) {
          return;
        }
        lastResult = newValue || null;
        cb((newValue || undefined) as any, isInitial ? 'INITIAL' : 'CHANGE');
      };

      this.engine.ev.addListener(model.name, listener);
      listener();
      return () => this.engine.ev.removeListener(model.name, listener);
    } else {
      return this.engine.query(
        this.engine.getModel(model),
        queryArgs,
        queryType
      );
    }
  }
  //
  // Public
  //
  // insert
  public insert<T = IInsertItem>(
    model: string | IModel,
    value: (T & IInsertItem)[],
    options?: IInsertOptions
  ): Promise<(T & IGetItem)[]>;
  public insert<T = IInsertItem>(
    model: string | IModel,
    value: T & IInsertItem,
    options?: IInsertOptions
  ): Promise<T & IGetItem>;
  public insert<T = IInsertItem>(
    model: string | IModel,
    value: (T & IInsertItem)[] | (T & IInsertItem),
    options?: IInsertOptions
  ): Promise<(T & IGetItem)[] | T & IGetItem> {
    const wasArray = Array.isArray(value);
    return this.engine
      .insert(this.engine.getModel(model), ensureArray(value), options)
      .then(items => (wasArray ? items : items[0]));
  }
  // remove
  public remove<T = any>(
    model: string | IModel,
    id: string | string[]
  ): Promise<void> {
    return this.engine.remove(this.engine.getModel(model), ensureArray(id));
  }
  // all
  public all<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery
  ): Promise<(T & IGetItem)[]>;
  public all<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<(T & IGetItem)[]>
  ): () => void;
  public all<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<(T & IGetItem)[]>
  ): Promise<T[]> | (() => void) {
    return this.query<T[]>(model, queryArgs, 'all', cb);
  }
  // count
  public count(model: string | IModel, queryArgs?: IAllQuery): Promise<number>;
  public count(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<number>
  ): () => void;
  public count(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<number>
  ): Promise<number> | (() => void) {
    return this.query<number>(model, queryArgs, 'count', cb);
  }
  // get
  public get<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery
  ): Promise<T & IGetItem>;
  public get<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<T & IGetItem>
  ): () => void;
  public get<T = TBase>(
    model: string | IModel,
    queryArgs?: IAllQuery,
    cb?: IObserverCallback<T & IGetItem>
  ): Promise<T> | (() => void) {
    return this.query<T>(model, queryArgs, 'get', cb);
  }
}

interface ISchema {
  [key: string]: IModel;
}
export abstract class SQLightEngine {
  ev = new EventEmitter();
  schema: ISchema;
  options: ISQLightSQLEngineOptions;
  defaultColumns() {
    return [this.idField, this.revField, this.removedField];
  }

  constructor(
    dbSchema: IModelCreate[],
    options: ISQLightSQLEngineOptions = {}
  ) {
    this.options = options;
    this.schema = dbSchema.reduce((obj: any, model: any) => {
      if (!model.columns) {
        model.columns = [];
      }
      if (!model.index) {
        model.index = [];
      }
      return { ...obj, [model.name]: model };
    }, {});
    // this.isReady = new Promise(yay => this.connect().then(yay));
  }
  public get idField() {
    return this.getDefaultFieldName('id');
  }
  public get revField() {
    return this.getDefaultFieldName('rev');
  }
  public get removedField() {
    return this.getDefaultFieldName('removed');
  }
  public getDefaultFieldName(name: string, defaultName?: string) {
    return this.options.defaultColumnNames &&
      this.options.defaultColumnNames[name]
      ? this.options.defaultColumnNames[name]
      : defaultName || name;
  }
  public destroy() {}
  public getModel(name: string | IModel) {
    if (typeof name !== 'string') {
      return name;
    }
    if (!this.schema[name]) {
      throw new Error(`Could not find model ${name}`);
    }
    return this.schema[name];
  }
  public connect() {
    return Promise.all(
      Object.keys(this.schema).map(key => this.addModel(this.schema[key]))
    );
  }
  public addModel(model: IModel): Promise<any> {
    this.schema[model.name] = model;
    return Promise.resolve();
  }
  // Abstract
  abstract query<T>(
    model: IModel,
    queryArgs: IAllQuery,
    queryType: 'all' | 'get' | 'count'
  ): Promise<T>;
  abstract remove(model: IModel, id: string[]): Promise<void>;
  abstract insert<T = any>(
    model: IModel,
    value: (T & IInsertItem)[],
    options?: IInsertOptions
  ): Promise<(T & IGetItem)[]>;

  notifyChange(model: IModel, changes: any[], result: any[]) {
    result.forEach((newValue, i: number) => {
      const change = {
        newValue,
        change: changes[i],
        oldValue: undefined,
        properties: Object.keys(changes[i]),
        type: changes[i][this.idField] ? 'UPDATE' : 'CREATE',
        model: model.name
      };
      this.ev.emit(model.name, change);
      this.ev.emit('*', change);
    });
  }
}
