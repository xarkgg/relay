import {generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {demand,RelayError} from './errors.js';
import {normalizePublicKey,verifyEntitlement,publicKeyBase64} from './entitlement-token.js';

function exactOrigin(value) {
  if(!value)return null;
  const url=new URL(value);
  demand(value.replace(/\/$/,'')===url.origin&&(
    url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))),
  'BAD_ACTIVATION_CONFIG','The commerce service must be an exact HTTPS or loopback origin.');
  return url.origin;
}
async function jsonRequest(url,body) {
  let response;
  try {response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12_000)});}
  catch {throw new RelayError('ACTIVATION_UNAVAILABLE','The activation service did not respond. Your local data was not changed.',503);}
  const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>32_000){await reader.cancel();throw new Error('response limit');}text+=decoder.decode(value,{stream:true});}
    const result=JSON.parse(text+decoder.decode());
    if(!response.ok)throw new RelayError(result.code||'ACTIVATION_FAILED',result.error||'Activation failed.',response.status);
    return result;
  } catch(error) {
    if(error instanceof RelayError)throw error;
    throw new RelayError('ACTIVATION_RESPONSE_INVALID','The activation service returned an invalid response.',502);
  } finally {reader.releaseLock();}
}

export function createActivation(store,{commerceOrigin='',publicKey='',kid=''}={}) {
  const origin=exactOrigin(commerceOrigin);
  demand((!origin&&!publicKey&&!kid)||(origin&&publicKey&&kid),'BAD_ACTIVATION_CONFIG',
    'Set the commerce origin, entitlement public key, and key ID together.');
  const configured=Boolean(origin);
  if(configured)normalizePublicKey(publicKey);
  const row=()=>store.db.prepare('SELECT * FROM activation WHERE id=1').get();
  const inspect=record=>{
    if(!configured)return {configured:false,active:false};
    if(!record)return {configured:true,active:false};
    if(record.revoked_at!==null)return {configured:true,active:false,revoked:true};
    try {
      const privateObject=createPrivateKey({key:Buffer.from(record.private_key,'base64'),format:'der',type:'pkcs8'});
      demand(publicKeyBase64(privateObject)===normalizePublicKey(record.public_key),'BAD_ENTITLEMENT','The local device key does not match.',403);
      const payload=verifyEntitlement(record.token,{publicKey,kid,issuer:origin,deviceKey:record.public_key});
      return {configured:true,active:true,expiresAt:payload.exp*1000,deviceId:payload.device,agent:payload.agent,offline:true};
    } catch {return {configured:true,active:false,expired:record.expires_at<=Date.now()};}
  };
  return {
    configured,
    status:()=>inspect(row()),
    require(agent) {
      if(!configured)return;
      const status=inspect(row());
      demand(status.active&&status.agent===agent,'ACTIVATION_REQUIRED','Activate this device before using local AI.',403);
    },
    async claim(code,name='My Relay device') {
      demand(configured,'ACTIVATION_DISABLED','Device activation is not configured.',503);
      const {privateKey:privateObject,publicKey:publicObject}=generateKeyPairSync('ed25519');
      const privateKey=privateObject.export({format:'der',type:'pkcs8'}).toString('base64');
      const deviceKey=publicObject.export({format:'der',type:'spki'}).toString('base64');
      const result=await jsonRequest(`${origin}/api/commerce/devices/claim`,{code,publicKey:deviceKey,name});
      const payload=verifyEntitlement(result.token,{publicKey,kid,issuer:origin,deviceKey});
      store.db.prepare(`INSERT INTO activation(id,private_key,public_key,token,expires_at,revoked_at,updated_at)
        VALUES(1,?,?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET private_key=excluded.private_key,
        public_key=excluded.public_key,token=excluded.token,expires_at=excluded.expires_at,revoked_at=NULL,updated_at=excluded.updated_at`)
        .run(privateKey,deviceKey,result.token,payload.exp*1000,Date.now());
      store.event('device.activated',{detail:{deviceId:payload.device,expiresAt:payload.exp*1000}});
      return inspect(row());
    },
    async sync() {
      const local=inspect(row());
      if(!local.active)return local;
      try {
        const result=await jsonRequest(`${origin}/api/commerce/devices/status`,{token:row().token});
        if(!result.active) {
          store.db.prepare('UPDATE activation SET revoked_at=?,updated_at=? WHERE id=1').run(Date.now(),Date.now());
          store.event('device.revoked',{detail:{deviceId:local.deviceId}});
          return {...local,active:false,revoked:Boolean(result.revoked),offline:false};
        }
        return {...local,offline:false};
      } catch(error) {
        if(error.status&&error.status<500)throw error;
        return local;
      }
    }
  };
}
