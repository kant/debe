import { fieldTypes, IMiddleware } from '../types';
import { toISO, Emitter, isEqual } from '../utils';

export interface IChangeListenerOptions {
  emitter?: Emitter;
  revField?: string;
}

const defaultRevisionField = 'rev';
export const changeListenerPlugin: IMiddleware<IChangeListenerOptions> = ({
  emitter = new Emitter(),
  revField = defaultRevisionField
}) => db => {
  const addRev = (item: any): [any, any] => {
    if (!item) {
      return item;
    }
    item[revField] = toISO(new Date());
    return item;
  };

  return {
    listener({ collection = '*', query, method = 'insert' }, callback) {
      if (method === 'insert') {
        return emitter.on(collection, callback);
      }
      let lastResult: any = undefined;
      const listener = async () => {
        // let isInitial = lastResult === undefined;
        try {
          const newValue = await (db[method] as any)(collection, query);
          if (!isEqual(lastResult, newValue as any, revField)) {
            callback((newValue === null ? undefined : newValue) as any);
          }
          lastResult = newValue || null;
        } catch (err) {
          callback(err);
        }
      };
      listener();
      return emitter.on(collection, listener);
    },
    transformItemIn(collection, item) {
      return addRev(item) as any;
    },
    afterInsert(collection, items, options) {
      emitter.emit(collection.name, items, options);
    },
    collection(collection) {
      collection.specialFields.rev = revField;
      collection.fields[revField] = fieldTypes.STRING;
      collection.index[revField] = fieldTypes.STRING;
      return collection;
    }
  };
};