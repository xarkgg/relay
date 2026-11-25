import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceConfig} from '../server/commerce/config.js';
import {openCommerceDatabase,tlsForUrl,connectionStringForTls} from '../server/commerce/database.js';
import {isPiAddress} from '../shared/pi-address.js';
import {verifiedAmount} from '../server/commerce/payments.js';

const merchant = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const configured = {RELAY_PI_AUTH_ENABLED:'1',RELAY_PI_CHECKOUT_ENABLED:'1',RELAY_SESSION_SECRET:'x'.repeat(32),
  RELAY_PI_API_KEY:'fixture-server-key',RELAY_PI_MERCHANT_ADDRESS:merchant,RELAY_PI_PRICE:'1.25'};

test('commerce defaults to disabled Testnet features',()=>{
  const config=commerceConfig({});
  assert.equal(config.authEnabled,false);
  assert.equal(config.checkoutEnabled,false);
  assert.equal(config.network,'Pi Testnet');
});
test('merchant addresses require a StrKey checksum',()=>{
  assert.equal(isPiAddress(merchant),true);
  assert.equal(isPiAddress(merchant.slice(0,-1)+'A'),false);
  assert.throws(()=>commerceConfig({...configured,RELAY_PI_MERCHANT_ADDRESS:merchant.slice(0,-1)+'A'}));
});
test('checkout is explicitly priced and cannot charge Mainnet',()=>{
  assert.equal(commerceConfig(configured).price,'12500000');
  for(const change of [{RELAY_PI_PRICE:''},{RELAY_PI_NETWORK:'Pi Network'},{RELAY_PI_AUTH_ENABLED:'0'},
    {RELAY_PI_API_KEY:''},{RELAY_SESSION_SECRET:'short'},{RELAY_PI_SANDBOX:'yes'},{RELAY_PI_SANDBOX:'0'}]) {
    assert.throws(()=>commerceConfig({...configured,...change}));
  }
});
test('one-stroop amounts work while imprecise numbers are refused',()=>{
  assert.equal(verifiedAmount(0.0000001),'1');
  assert.equal(verifiedAmount(1.25),'12500000');
  assert.throws(()=>verifiedAmount(0.10000000000000002));
});
test('serverless storage fails closed without a persistent database',async()=>{
  await assert.rejects(openCommerceDatabase({databaseUrl:'',serverless:true}),error=>error.code==='NO_DATABASE');
});
test('managed Postgres uses TLS without letting sslmode override the decision',()=>{
  const remote='postgresql://u:p@example.com/db?sslmode=require&supa=pooler';
  const tls=tlsForUrl(remote);
  assert.deepEqual(tls,{rejectUnauthorized:true});
  const result=new URL(connectionStringForTls(remote,tls));
  assert.equal(result.searchParams.has('sslmode'),false);
  assert.equal(result.searchParams.get('supa'),'pooler');
  assert.equal(tlsForUrl('postgresql://u:p@localhost/db'),undefined);
  assert.equal(tlsForUrl('postgresql://u:p@example.com/db?sslmode=disable'),false);
  assert.deepEqual(tlsForUrl(remote,false),{rejectUnauthorized:false});
});
