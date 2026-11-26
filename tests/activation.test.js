import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {openStore} from '../server/store.js';
import {createActivation} from '../server/activation.js';
import {keyFingerprint,loadEntitlementKeys,signEntitlement,verifyEntitlement} from '../server/entitlement-token.js';

const hosted=generateKeyPairSync('ed25519');
const publicKey=hosted.publicKey.export({format:'der',type:'spki'}).toString('base64');
const privateKey=hosted.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const keys=loadEntitlementKeys({privateKey,publicKey,kid:'test-key'});
const device=generateKeyPairSync('ed25519');
const deviceKey=device.publicKey.export({format:'der',type:'spki'}).toString('base64');
const payload=(now=Date.now())=>({iss:'https://relay.example',aud:'relay-local-agent',sub:'account',device:'device',
  entitlement:'entitlement',agent:'follow-up-desk',network:'Pi Testnet',device_key:keyFingerprint(deviceKey),
  iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,jti:randomUUID()});

test('signed entitlements reject tampering, wrong devices, and expiry',async()=>{
  const claims=payload();
  const token=signEntitlement(keys,claims);
  assert.equal(verifyEntitlement(token,{publicKey,kid:'test-key',issuer:'https://relay.example',deviceKey}).device,'device');
  assert.throws(()=>verifyEntitlement(token+'x',{publicKey,kid:'test-key',issuer:'https://relay.example',deviceKey}));
  const other=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).toString('base64');
  assert.throws(()=>verifyEntitlement(token,{publicKey,kid:'test-key',issuer:'https://relay.example',deviceKey:other}));
  assert.throws(()=>verifyEntitlement(token,{publicKey,kid:'test-key',issuer:'https://relay.example',deviceKey,now:Date.now()+3_700_000}));
});

test('local activation stores the device key only after verifying the hosted signature',async t=>{
  let revoked=false;
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/commerce/devices/status')return res.end(JSON.stringify({active:!revoked,revoked,expiresAt:Date.now()+3_600_000}));
    const now=Date.now();const token=signEntitlement(keys,{iss:`http://127.0.0.1:${server.address().port}`,aud:'relay-local-agent',
      sub:'account',device:'device',entitlement:'entitlement',agent:'follow-up-desk',network:'Pi Testnet',
      device_key:keyFingerprint(input.publicKey),iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,jti:randomUUID()});
    res.statusCode=201;res.end(JSON.stringify({token,expiresAt:now+3_600_000,device:{id:'device',name:input.name}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const store=openStore();t.after(()=>store.close());
  const origin=`http://127.0.0.1:${server.address().port}`;
  const activation=createActivation(store,{commerceOrigin:origin,publicKey,kid:'test-key'});
  assert.deepEqual(activation.status(),{configured:true,active:false});
  const active=await activation.claim('ABCD-EFGH-JKLM-NPQR','Desk PC');
  assert.equal(active.active,true);activation.require('follow-up-desk');
  const stored=store.db.prepare('SELECT * FROM activation').get();
  assert.notEqual(stored.private_key,stored.public_key);assert.doesNotMatch(stored.token,/PRIVATE/);
  assert.equal((await activation.sync()).offline,false);
  revoked=true;
  const status=await activation.sync();assert.equal(status.active,false);assert.equal(status.revoked,true);
  assert.throws(()=>activation.require('follow-up-desk'),error=>error.code==='ACTIVATION_REQUIRED');
});
