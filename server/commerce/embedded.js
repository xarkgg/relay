import { PGlite } from '@electric-sql/pglite';
import { applyCommerceMigrations } from './database.js';

// Development and integration tests only. The Vercel entry never imports this module.
export async function openEmbeddedCommerceDatabase(dir = ':memory:') {
  const local = new PGlite(dir === ':memory:' ? undefined : dir);
  await local.transaction(tx=>applyCommerceMigrations({query:(sql,params)=>tx.query(sql,params)}));
  return {
    query: (sql,params) => local.query(sql,params),
    transaction: fn => local.transaction(tx => fn({query:(sql,params)=>tx.query(sql,params)})),
    close: () => local.close()
  };
}
