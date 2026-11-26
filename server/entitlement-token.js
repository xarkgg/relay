import {createPrivateKey,createPublicKey,sign,verify,createHash} from 'node:crypto';
import {demand,RelayError} from './errors.js';

const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const keyFrom=(value,type)=>{
  demand(typeof value==='string'&&value.length>=40&&value.length<=512&&/^[A-Za-z0-9+/=]+$/.test(value),
    'BAD_SIGNING_KEY','Entitlement keys must be base64 DER values.');
  try {
    const key=(type==='private'?createPrivateKey:createPublicKey)({key:Buffer.from(value,'base64'),format:'der',type:type==='private'?'pkcs8':'spki'});
    demand(key.asymmetricKeyType==='ed25519','BAD_SIGNING_KEY','Entitlement keys must use Ed25519.');
    return key;
  } catch(error) {
    if(error instanceof RelayError)throw error;
    throw new RelayError('BAD_SIGNING_KEY','The entitlement signing key is invalid.');
  }
};

export function publicKeyBase64(key) {
  const publicObject=key.type==='public'?key:createPublicKey(key);
  return publicObject.export({format:'der',type:'spki'}).toString('base64');
}
export function normalizePublicKey(value) {
  return publicKeyBase64(keyFrom(value,'public'));
}
export function keyFingerprint(value) {
  const key=keyFrom(normalizePublicKey(value),'public');
  return createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('base64url');
}
export function loadEntitlementKeys({privateKey,publicKey,kid}) {
  demand(typeof kid==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(kid),'BAD_SIGNING_KEY','Use a short signing key ID.');
  const privateObject=keyFrom(privateKey,'private');
  const publicObject=keyFrom(publicKey,'public');
  demand(publicKeyBase64(privateObject)===publicKeyBase64(publicObject),'BAD_SIGNING_KEY','The entitlement key pair does not match.');
  return {privateKey:privateObject,publicKey:publicObject,kid};
}
export function signEntitlement(keys,payload) {
  const header=encoded({alg:'EdDSA',typ:'JWT',kid:keys.kid});
  const body=encoded(payload);
  const input=`${header}.${body}`;
  return `${input}.${sign(null,Buffer.from(input),keys.privateKey).toString('base64url')}`;
}
export function readEntitlementClaims(token) {
  demand(typeof token==='string'&&token.length<=8192,'BAD_ENTITLEMENT','The activation record is invalid.',403);
  const parts=token.split('.');
  demand(parts.length===3&&parts.every(part=>/^[A-Za-z0-9_-]+$/.test(part)),'BAD_ENTITLEMENT','The activation record is invalid.',403);
  try {return JSON.parse(Buffer.from(parts[1],'base64url'));}
  catch {throw new RelayError('BAD_ENTITLEMENT','The activation record is invalid.',403);}
}
export function verifyEntitlement(token,{publicKey,kid,issuer,deviceKey,now=Date.now()}) {
  demand(typeof token==='string'&&token.length<=8192,'BAD_ENTITLEMENT','The activation record is invalid.',403);
  const parts=token.split('.');
  demand(parts.length===3&&parts.every(part=>/^[A-Za-z0-9_-]+$/.test(part)),'BAD_ENTITLEMENT','The activation record is invalid.',403);
  let header;
  const payload=readEntitlementClaims(token);
  try {header=JSON.parse(Buffer.from(parts[0],'base64url'));}
  catch {throw new RelayError('BAD_ENTITLEMENT','The activation record is invalid.',403);}
  const key=keyFrom(publicKey,'public');
  demand(header.alg==='EdDSA'&&header.typ==='JWT'&&header.kid===kid&&
    verify(null,Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],'base64url')),
    'BAD_ENTITLEMENT','The activation signature is invalid.',403);
  const seconds=Math.floor(now/1000);
  demand(payload.iss===issuer&&payload.aud==='relay-local-agent'&&payload.agent==='follow-up-desk'&&
    typeof payload.sub==='string'&&typeof payload.device==='string'&&typeof payload.entitlement==='string'&&
    typeof payload.jti==='string'&&Number.isInteger(payload.iat)&&Number.isInteger(payload.exp)&&
    payload.iat<=seconds+60&&payload.exp>seconds&&payload.exp-payload.iat<=31*86_400&&
    payload.device_key===keyFingerprint(deviceKey),'BAD_ENTITLEMENT','This activation does not match this device or has expired.',403);
  return payload;
}
