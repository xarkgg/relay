import express from 'express';
import { commerceConfig, COMMERCE_CSP } from './commerce/config.js';
import { createCommerceApp } from './commerce/app.js';
import { openCommerceDatabase } from './commerce/database.js';
import { openEmbeddedCommerceDatabase } from './commerce/embedded.js';

if (process.env.VERCEL) throw new Error('Use the API function on Vercel.');
const config = commerceConfig();
const db = config.databaseUrl ? await openCommerceDatabase(config) : await openEmbeddedCommerceDatabase(config.pgliteDir);
const app = express();
app.use((_req,res,next) => {res.set('Content-Security-Policy',COMMERCE_CSP);next();});
app.use('/api/commerce',createCommerceApp({config,database:db}));
app.use(express.static('dist'));
const port = Number(new URL(config.origin).port || 4311);
const server = app.listen(port,'127.0.0.1',()=>console.log(`Relay storefront: ${config.origin}`));
for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
