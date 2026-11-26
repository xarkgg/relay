import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {openEmbeddedCommerceDatabase} from '../server/commerce/embedded.js';
import {commerceConfig} from '../server/commerce/config.js';
import {createCommerceApp} from '../server/commerce/app.js';
import {createPiClient} from '../server/commerce/pi.js';

// Real Postgres + HTTP integration. The Pi server below is a protocol fixture,
// not evidence of a real Pi sign-in or blockchain payment.
const MERCHANT='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TOKEN_A='fixture-token-user-a-123456';
const TOKEN_B='fixture-token-user-b-123456';
const TX='a'.repeat(64);
let db,provider,server,base,config;
const entitlementKeys=generateKeyPairSync('ed25519');
const PRIVATE_KEY=entitlementKeys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const PUBLIC_KEY=entitlementKeys.publicKey.export({format:'der',type:'spki'}).toString('base64');
let payments=new Map(),calls={approve:0,complete:0},failure=null;
let scopes=['username','payments'];

const listen=app=>new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
before(async()=>{
  db=await openEmbeddedCommerceDatabase(':memory:');
  provider=await listen(createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/v2/me') {
      const token=req.headers.authorization?.slice(7);
      if(![TOKEN_A,TOKEN_B].includes(token)) {res.statusCode=401;return res.end('{}');}
      return res.end(JSON.stringify({uid:token===TOKEN_A?'uid-a':'uid-b',username:'same-display-name',
        credentials:{scopes,valid_until:{iso8601:new Date(Date.now()+3_600_000).toISOString()}}}));
    }
    if(req.headers.authorization!=='Key fixture-server-key') {res.statusCode=401;return res.end('{}');}
    const match=req.url.match(/^\/v2\/payments\/([^/]+)(?:\/(approve|complete))?$/);
    const payment=match&&payments.get(match[1]);
    if(!payment) {res.statusCode=404;return res.end('{}');}
    if(match[2]==='approve') {
      calls.approve++;
      if(failure==='approve') {res.statusCode=503;return res.end('{}');}
      payment.status.developer_approved=true;
    }
    if(match[2]==='complete') {
      calls.complete++;
      let body='';for await(const chunk of req)body+=chunk;
      const txid=JSON.parse(body).txid;
      payment.transaction={txid,verified:failure!=='unverified'};
      payment.status.transaction_verified=failure!=='unverified';
      payment.status.developer_completed=failure!=='unverified';
      if(failure==='lost-completion') {res.statusCode=503;return res.end('{}');}
    }
    res.end(JSON.stringify(payment));
  }));
  config=commerceConfig({RELAY_PI_AUTH_ENABLED:'1',RELAY_PI_CHECKOUT_ENABLED:'1',
    RELAY_SESSION_SECRET:'test-secret-'.repeat(4),RELAY_PI_API_KEY:'fixture-server-key',
    RELAY_PI_MERCHANT_ADDRESS:MERCHANT,RELAY_PI_PRICE:'1.25',RELAY_DEVICE_ACTIVATION_ENABLED:'1',
    RELAY_ENTITLEMENT_PRIVATE_KEY:PRIVATE_KEY,RELAY_ENTITLEMENT_PUBLIC_KEY:PUBLIC_KEY,RELAY_ENTITLEMENT_KID:'test-key-1'});
  const pi=createPiClient({apiKey:config.apiKey,base:`http://127.0.0.1:${provider.address().port}/v2`});
  server=await listen(createCommerceApp({config,database:db,pi}));
  base=`http://127.0.0.1:${server.address().port}`;
  config.origins.add(base);
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(provider) await new Promise(resolve=>provider.close(resolve));
  await db?.close();
});
beforeEach(async()=>{
  await db.query('TRUNCATE relay_entitlements,relay_payments,relay_intents,relay_sessions,relay_accounts,relay_auth_limits CASCADE');
  payments=new Map();calls={approve:0,complete:0};failure=null;
  scopes=['username','payments'];config.price='12500000';config.merchant=MERCHANT;
});

async function request(path,{session,body,method=body?'POST':'GET',headers={}}={}) {
  const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),
    ...(session?{Authorization:`Bearer ${session.token}`,'X-Relay-CSRF':session.csrf}:{}),...headers},
    body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
async function login(token=TOKEN_A) {
  const response=await request('/auth/pi',{body:{accessToken:token,uid:'forged-victim'}});
  assert.equal(response.status,200);return response.body;
}
async function purchase(session,id='pay-a') {
  const response=await request('/intents',{session,body:{amount:0.0000001}});
  assert.equal(response.status,201);
  const intent=response.body;
  payments.set(id,{identifier:id,user_uid:session===null?'':'uid-a',amount:intent.amount,memo:intent.memo,
    metadata:intent.metadata,to_address:MERCHANT,from_address:MERCHANT,direction:'user_to_app',network:'Pi Testnet',
    status:{developer_approved:false,transaction_verified:false,developer_completed:false,cancelled:false,user_cancelled:false},transaction:null});
  return {id,intent};
}
const count=async()=>Number((await db.query('SELECT count(*) AS count FROM relay_entitlements')).rows[0].count);
async function machine(path,body) {
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}

test('commerce schema records its applied migration',async()=>{
  assert.deepEqual((await db.query('SELECT version FROM relay_schema_migrations ORDER BY version')).rows,[{version:1},{version:2}]);
});
test('sign-in uses verified app UID, not payload UID or username',async()=>{
  const a=await login();const b=await login(TOKEN_B);
  assert.notEqual(a.account.id,b.account.id);
  const rows=(await db.query('SELECT pi_uid FROM relay_accounts ORDER BY pi_uid')).rows;
  assert.deepEqual(rows.map(row=>row.pi_uid),['uid-a','uid-b']);
  const hashes=(await db.query('SELECT token_hash FROM relay_sessions')).rows;
  assert.ok(hashes.every(row=>row.token_hash!==a.token&&row.token_hash!==b.token));
});
test('invalid Pi tokens cannot create an account',async()=>{
  assert.equal((await request('/auth/pi',{body:{accessToken:'invalid-token-123456'}})).status,401);
  assert.equal((await db.query('SELECT * FROM relay_accounts')).rows.length,0);
});
test('origin and CSRF protect account and checkout mutations',async()=>{
  assert.equal((await request('/auth/pi',{body:{accessToken:TOKEN_A},headers:{Origin:'https://evil.example'}})).status,403);
  const session=await login();
  assert.equal((await request('/intents',{session,body:{},headers:{'X-Relay-CSRF':'wrong'}})).status,403);
  assert.equal((await request('/purchases')).status,401);
});
test('price is server-owned and repeated intent requests reuse one intent',async()=>{
  const session=await login();const {intent}=await purchase(session);
  assert.equal(intent.amount,1.25);
  const again=await request('/intents',{session,body:{amount:999}});
  assert.equal(again.body.id,intent.id);
});
test('another account cannot approve or recover your payment',async()=>{
  const a=await login();const b=await login(TOKEN_B);await purchase(a);
  assert.equal((await request('/payments/pay-a/approve',{session:b,body:{}})).status,404);
  assert.equal(calls.approve,0);assert.equal(await count(),0);
});
test('wrong amounts, networks, recipients, and directions are refused before approval',async()=>{
  const session=await login();await purchase(session);
  const original=structuredClone(payments.get('pay-a'));
  for(const change of [{amount:0.1},{network:'Pi Network'},{to_address:'another-wallet'},{direction:'app_to_user'},{user_uid:'uid-b'}]) {
    payments.set('pay-a',{...structuredClone(original),...change});
    assert.equal((await request('/payments/pay-a/approve',{session,body:{}})).status,409);
  }
  assert.equal(calls.approve,0);assert.equal(await count(),0);
});
test('approval can retry, grants nothing, and cannot bind a second payment',async()=>{
  const session=await login();await purchase(session);
  failure='approve';
  assert.equal((await request('/payments/pay-a/approve',{session,body:{}})).status,503);
  failure=null;
  assert.equal((await request('/payments/pay-a/approve',{session,body:{}})).status,200);
  assert.equal((await request('/payments/pay-a/approve',{session,body:{}})).status,200);
  assert.equal(calls.approve,2);assert.equal(await count(),0);
  payments.set('pay-b',{...structuredClone(payments.get('pay-a')),identifier:'pay-b'});
  assert.equal((await request('/payments/pay-b/approve',{session,body:{}})).status,409);
});
test('unverified completion cannot grant access',async()=>{
  const session=await login();await purchase(session);
  await request('/payments/pay-a/approve',{session,body:{}});failure='unverified';
  assert.equal((await request('/payments/pay-a/complete',{session,body:{txid:TX}})).status,503);
  assert.equal(await count(),0);
});
test('completed payments grant exactly one access record without extending it on retries',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  const first=await request('/payments/pay-a/complete',{session,body:{txid:TX}});
  const second=await request('/payments/pay-a/complete',{session,body:{txid:TX}});
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(first.body.entitlement.id,second.body.entitlement.id);
  assert.equal(first.body.entitlement.expires_at,second.body.entitlement.expires_at);
  assert.equal(await count(),1);assert.equal(calls.complete,1);
  assert.equal((await request('/intents',{session,body:{}})).status,409);
});
test('a lost completion response recovers from authoritative Pi state',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  failure='lost-completion';
  assert.equal((await request('/payments/pay-a/complete',{session,body:{txid:TX}})).status,503);
  assert.equal(await count(),0);failure=null;
  assert.equal((await request('/payments/pay-a/recover',{session,body:{}})).status,200);
  assert.equal(await count(),1);assert.equal(calls.complete,1);
});
test('mismatched transaction hashes cannot complete a payment',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  payments.get('pay-a').transaction={txid:TX,verified:true};
  assert.equal((await request('/payments/pay-a/complete',{session,body:{txid:'b'.repeat(64)}})).status,409);
  assert.equal(calls.complete,0);assert.equal(await count(),0);
});
test('confirmed pre-transaction cancellation closes the intent and permits a fresh one',async()=>{
  const session=await login();const {intent}=await purchase(session);
  await request('/payments/pay-a/approve',{session,body:{}});
  payments.get('pay-a').status.user_cancelled=true;
  assert.equal((await request('/payments/pay-a/recover',{session,body:{}})).status,409);
  const next=await request('/intents',{session,body:{}});
  assert.equal(next.status,201);assert.notEqual(next.body.id,intent.id);assert.equal(await count(),0);
});
test('session expiry and logout prevent further account access',async()=>{
  const session=await login();
  assert.equal((await request('/logout',{session,body:{}})).status,200);
  assert.equal((await request('/purchases',{session})).status,401);
  const next=await login();
  await db.query('UPDATE relay_sessions SET expires_at=0');
  assert.equal((await request('/purchases',{session:next})).status,401);
});
test('Pi payment permission comes from /me rather than client scopes',async()=>{
  scopes=['username'];
  const session=await login();
  const response=await request('/intents',{session,body:{scopes:['payments']}});
  assert.equal(response.status,403);
  assert.equal(response.body.code,'PAYMENT_PERMISSION_REQUIRED');
});
test('simultaneous completion requests grant access once',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  const results=await Promise.all([request('/payments/pay-a/complete',{session,body:{txid:TX}}),
    request('/payments/pay-a/complete',{session,body:{txid:TX}})]);
  assert.ok(results.every(result=>result.status===200));
  assert.equal(results[0].body.entitlement.id,results[1].body.entitlement.id);
  assert.equal(await count(),1);
});
test('price and recipient stay frozen when operator configuration changes',async()=>{
  const session=await login();await purchase(session);
  config.price='25000000';config.merchant='replacement-merchant';
  assert.equal((await request('/payments/pay-a/approve',{session,body:{}})).status,200);
  assert.equal((await request('/payments/pay-a/complete',{session,body:{txid:TX}})).status,200);
  assert.equal(await count(),1);
});
test('a transaction hash cannot fund a second access record',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  await request('/payments/pay-a/complete',{session,body:{txid:TX}});
  await db.query('UPDATE relay_entitlements SET expires_at=0');
  await purchase(session,'pay-b');await request('/payments/pay-b/approve',{session,body:{}});
  assert.equal((await request('/payments/pay-b/complete',{session,body:{txid:TX}})).status,409);
  assert.equal(await count(),1);
  assert.equal((await db.query("SELECT state FROM relay_payments WHERE id='pay-b'")).rows[0].state,'approved');
});
test('one-time pairing binds a signed activation to its local public key',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  await request('/payments/pay-a/complete',{session,body:{txid:TX}});
  const pairing=await request('/devices/pairing',{session,body:{}});
  assert.equal(pairing.status,201);assert.match(pairing.body.code,/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  const deviceKeys=generateKeyPairSync('ed25519');
  const publicKey=deviceKeys.publicKey.export({format:'der',type:'spki'}).toString('base64');
  const claim=await machine('/devices/claim',{code:pairing.body.code,publicKey,name:'Desk PC'});
  assert.equal(claim.status,201);assert.equal(claim.body.device.name,'Desk PC');assert.equal(typeof claim.body.token,'string');
  assert.equal((await machine('/devices/claim',{code:pairing.body.code,publicKey,name:'Replay'})).status,404);
  const status=await machine('/devices/status',{token:claim.body.token});
  assert.deepEqual(status.body,{active:true,revoked:false,expiresAt:claim.body.expiresAt});
  const list=await request('/devices',{session});assert.equal(list.body.devices.length,1);
  await request(`/devices/${claim.body.device.id}/revoke`,{session,body:{}});
  const revoked=await machine('/devices/status',{token:claim.body.token});
  assert.equal(revoked.body.active,false);assert.equal(revoked.body.revoked,true);
});
test('expired and malformed pairing codes cannot register a device',async()=>{
  const session=await login();await purchase(session);await request('/payments/pay-a/approve',{session,body:{}});
  await request('/payments/pay-a/complete',{session,body:{txid:TX}});
  assert.equal((await machine('/devices/claim',{code:'WRONG-CODE',publicKey:PUBLIC_KEY,name:'PC'})).status,404);
  const pairing=await request('/devices/pairing',{session,body:{}});
  await db.query('UPDATE relay_pairings SET expires_at=0');
  assert.equal((await machine('/devices/claim',{code:pairing.body.code,publicKey:PUBLIC_KEY,name:'PC'})).status,404);
});
