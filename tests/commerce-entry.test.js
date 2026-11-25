import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import handler from '../api/commerce.js';

test('Vercel commerce entry routes explicit paths without starting a workspace or database',async t=>{
  const keys=['RELAY_COMMERCE_URL','RELAY_PI_AUTH_ENABLED','RELAY_PI_CHECKOUT_ENABLED','VERCEL'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  process.env.RELAY_COMMERCE_URL=origin;
  process.env.RELAY_PI_AUTH_ENABLED='0';process.env.RELAY_PI_CHECKOUT_ENABLED='0';process.env.VERCEL='';
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    for(const key of keys) if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  });
  const rewritten=await fetch(origin+'/api/commerce?relay_route=config');
  assert.equal(rewritten.status,200);
  const config=await rewritten.json();
  assert.equal(config.authEnabled,false);assert.equal(config.checkoutEnabled,false);
  assert.equal(config.activationReady,false);
  assert.equal(config.apiKey,undefined);assert.equal(config.sessionSecret,undefined);
  assert.equal(rewritten.headers.get('cache-control'),'no-store');
  assert.equal(rewritten.headers.get('x-content-type-options'),'nosniff');
  const direct=await fetch(origin+'/api/commerce/session');
  assert.deepEqual(await direct.json(),{account:null});
  const blocked=await fetch(origin+'/api/commerce?relay_route=../../server/store.js');
  assert.equal(blocked.status,404);
});
