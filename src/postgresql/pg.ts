import { SQLJsonCore } from 'debe-sql';
//@ts-ignore
import { Pool } from 'pg';

export class PostgreSQL extends SQLJsonCore {
  pool: any;
  constructor(connectionString: string) {
    super();
    this.pool = new Pool({
      connectionString
    });
  }
  selectJSONField(field: string) {
    return `${this.bodyField} ->> '${field}' `;
  }
  createTableIndex(model: string, field: string) {
    if (this.columns.indexOf(field) !== -1) {
      return super.createTableIndex(model, field);
    }
    return `CREATE INDEX IF NOT EXISTS "${model}_${field}" ON "${model}" ((${
      this.bodyField
    } ->> '${field}'))`;
  }
  async exec<T>(
    sql: string,
    args: any[],
    type?: 'all' | 'get' | 'count' | 'insert'
  ): Promise<T> {
    sql = sql
      .split('?')
      .reduce((state, part, i) => (i === 0 ? part : `${state}$${i}${part}`));
    if (type === 'count') {
      return this.pool
        .query(sql, args)
        .then((x: any) => parseInt(x.rows[0].count));
    } else if (type === 'get') {
      return this.pool.query(sql, args).then((x: any) => x.rows[0]);
    } else if (type === 'all') {
      return this.pool.query(sql, args).then((x: any) => x.rows);
    } else if (type === 'insert') {
      const client = await this.pool.connect();
      try {
        await Promise.all(args.map(arg => client.query(sql, arg)));
        client.release();
      } catch (err) {
        client.release();
        throw err;
      }
      return {} as T;
    } else {
      const client = await this.pool.connect();
      try {
        await Promise.all(args.map(arg => client.query(arg)));
        client.release();
      } catch (err) {
        client.release();
        throw err;
      }
      return {} as T;
    }
  }
}

/*
export function postgres(connectionString: string): IDB {
  return {
    close: () => {},
    transaction: async cb => {
      let resolved = false;
      return new Promise(async (yay, nay) => {
        try {
          const client = await pool.connect();
          const results: any[] = [];
          let count = 0;
          const exec = async (statement: string, ...args: any[]) => {
            count = count + 1;
            try {
              statement = statement
                .split('?')
                .reduce((state, part, i) =>
                  i === 0 ? part : `${state} $${i} ${part}`
                );
              statement = statement
                .split(`json_extract(json, '$.`)
                .join(`(json->'`);
              statement = statement.split(`ON CONFLICT(id)`)[0];
              const [callback, ...rest] = extractCallback(args);
              console.log(statement, rest);
              const result = await client.query({
                text: statement,
                values: rest
              });
              count = count - 1;
              if (callback) {
                callback(result.rows);
                if (count === 0 && !resolved) {
                  yay(results as any);
                }
              }
            } catch (err) {
              nay(err);
            }
          };
          const resolve = (value: any) => {
            results.push(value);
          };
          cb(exec, resolve);
          if (count === 0) {
            resolved = true;
            yay(results as any);
          }
        } catch (err) {
          nay(err);
        }
      });
    }
  };
}*/