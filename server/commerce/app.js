import express from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { commerceConfig, COMMERCE_CSP, COMMERCE_PERMISSIONS } from './config.js';
import { openCommerceDatabase } from './database.js';
import { createPiClient } from './pi.js';
import { createAccounts } from './accounts.js';
import { createPayments } from './payments.js';
import { createDevices } from './devices.js';
import { demand, RelayError } from '../errors.js';

const safeEqual = (a,b) => typeof a === 'string' && timingSafeEqual(
  createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());

export function createCommerceApp({config = commerceConfig(), database, pi = createPiClient({apiKey:config.apiKey})} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('case sensitive routing',true);
  app.set('trust proxy',config.serverless ? 1 : false);
  const secure = config.origin.startsWith('https:');
  const cookieName = secure ? '__Host-relay_commerce' : 'relay_commerce';
  let initialization;
  async function services() {
    if (!initialization) initialization = (async () => {
      const db = database || await openCommerceDatabase(config);
      return {db,accounts:createAccounts(db,pi,config),payments:createPayments(db,pi,config),devices:createDevices(db,config)};
    })().catch(error => { initialization = null; throw error; });
    return initialization;
  }
  function tokenFrom(req) {
    if (req.get('authorization')) return req.get('authorization').match(/^Bearer ([a-f0-9]{64})$/)?.[1] || null;
    return req.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1) || null;
  }
  function cookie(token,seconds = 3600) {
    return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${secure?'; Secure':''}`;
  }
  app.use((req,res,next) => {
    res.set({'Cache-Control':'no-store','Content-Security-Policy':COMMERCE_CSP,
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':COMMERCE_PERMISSIONS});
    try {
      demand([...config.origins].some(origin => new URL(origin).host === req.get('host')),
        'HOST_DENIED','This host cannot access Relay accounts.',403);
      const origin = req.get('origin');
      const machine=['/devices/claim','/devices/status'].includes(req.path);
      demand(machine?!origin:(!origin||config.origins.has(origin)),'ORIGIN_DENIED','This origin cannot access Relay accounts.',403);
      demand(machine?!req.get('sec-fetch-site'):req.get('sec-fetch-site')!=='cross-site',
        'ORIGIN_DENIED','Cross-site account requests are not allowed.',403);
      if (!['GET','HEAD'].includes(req.method)) {
        demand(machine||config.origins.has(origin),'ORIGIN_REQUIRED','A same-origin request is required.',403);
        demand(req.is('application/json'),'JSON_REQUIRED','Send a JSON request.',415);
      }
      next();
    } catch (error) { next(error); }
  });
  app.use(express.json({limit:'8kb',strict:true}));
  app.use((req,_res,next) => {
    if (!['GET','HEAD'].includes(req.method) && (!req.body || Array.isArray(req.body))) return next(new RelayError('BAD_BODY','Send a JSON object.'));
    next();
  });
  app.get('/config',(_req,res) => {
    const storageReady=Boolean(database||config.databaseUrl);
    const authReady=config.authEnabled&&storageReady;
    const checkoutReady=config.checkoutEnabled&&authReady;
    res.json({authEnabled:authReady,checkoutEnabled:checkoutReady,network:config.network,
      sandbox:config.sandbox,activationReady:checkoutReady&&config.activationEnabled,price:checkoutReady?config.price:null});
  });
  app.get('/session',async (req,res) => {
    if (!config.authEnabled || !tokenFrom(req)) return res.json({account:null});
    const {accounts} = await services();
    const session = await accounts.session(tokenFrom(req));
    res.json(session ? {account:session.account,csrf:session.csrf,expires:session.expires} : {account:null});
  });
  app.post('/auth/pi',async (req,res) => {
    demand(config.authEnabled,'AUTH_DISABLED','Pi sign-in is not configured.',503);
    const {accounts} = await services();
    const result = await accounts.signIn(req.body.accessToken,req.ip);
    res.set('Set-Cookie',cookie(result.token,Math.max(1,Math.floor((result.expires-Date.now())/1000))));
    res.json(result);
  });
  app.post('/devices/claim',async (req,res) => {
    const {devices}=await services();
    res.status(201).json(await devices.claim(req.body,req.ip));
  });
  app.post('/devices/status',async (req,res) => {
    const {devices}=await services();
    res.json(await devices.status(req.body.token));
  });
  app.use((req,_res,next)=>{
    const known=['/logout','/purchases','/intents','/devices','/devices/pairing'].includes(req.path) ||
      /^\/devices\/[A-Za-z0-9_-]{1,120}\/revoke$/.test(req.path)||
      /^\/payments\/[A-Za-z0-9_-]{1,120}\/(approve|complete|recover)$/.test(req.path);
    if(!known)return next(new RelayError('NOT_FOUND','This account endpoint was not found.',404));
    next();
  });
  app.use(async (req,_res,next) => {
    const token = tokenFrom(req);
    demand(token,'SESSION_REQUIRED','Sign in with Pi to continue.',401);
    const {accounts} = await services();
    const session = await accounts.session(token);
    demand(session,'SESSION_REQUIRED','Sign in with Pi to continue.',401);
    if (!['GET','HEAD'].includes(req.method)) demand(safeEqual(req.get('x-relay-csrf'),session.csrf),
      'CSRF_DENIED','Reload or sign in again before continuing.',403);
    req.relaySession = session;
    req.relayToken = token;
    next();
  });
  app.post('/logout',async (req,res) => {
    const {accounts} = await services();
    await accounts.logout(req.relayToken);
    res.set('Set-Cookie',cookie('',0)).json({ok:true});
  });
  app.get('/purchases',async (req,res) => {
    const {db,payments} = await services();
    const pending = await db.query(`SELECT id,payment_id,state,amount_stroops,created_at FROM relay_intents
      WHERE account_id=$1 AND network=$2 AND state IN ('open','approved') ORDER BY created_at DESC LIMIT 20`,
      [req.relaySession.account.id,config.network]);
    res.json({entitlements:await payments.active(req.relaySession.account.id),pending:pending.rows});
  });
  app.post('/intents',async (req,res) => res.status(201).json(await (await services()).payments.intent(req.relaySession)));
  app.get('/devices',async (req,res)=>res.json({devices:await (await services()).devices.list(req.relaySession.account.id)}));
  app.post('/devices/pairing',async (req,res)=>res.status(201).json(await (await services()).devices.pairing(req.relaySession)));
  app.post('/devices/:id/revoke',async (req,res)=>{
    await (await services()).devices.revoke(req.relaySession.account.id,req.params.id);res.json({ok:true});
  });
  app.post('/payments/:id/approve',async (req,res) => res.json(await (await services()).payments.approve(req.params.id,req.relaySession)));
  app.post('/payments/:id/complete',async (req,res) => res.json(await (await services()).payments.complete(req.params.id,req.body.txid,req.relaySession)));
  app.post('/payments/:id/recover',async (req,res) => res.json(await (await services()).payments.recover(req.params.id,req.relaySession)));
  app.use((_req,_res,next) => next(new RelayError('NOT_FOUND','This account endpoint was not found.',404)));
  app.use((error,_req,res,_next) => {
    if (error instanceof RelayError) return res.status(error.status).json({code:error.code,error:error.message});
    if (error.type === 'entity.parse.failed') return res.status(400).json({code:'BAD_JSON',error:'Send valid JSON.'});
    if (error.type === 'entity.too.large') return res.status(413).json({code:'TOO_LARGE',error:'The request is too large.'});
    if (error.code === '23505') return res.status(409).json({code:'ALREADY_RECORDED',error:'This purchase or transaction is already recorded.'});
    res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'The account service could not confirm this action. Check your purchase status before trying again.'});
  });
  return app;
}
