import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {demand} from '../errors.js';
import {keyFingerprint,normalizePublicKey,signEntitlement,verifyEntitlement,readEntitlementClaims,publicKeyBase64} from '../entitlement-token.js';

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pairingCode() {
  const bytes=randomBytes(10);let bits=0,buffer=0,value='';
  for(const byte of bytes) {
    buffer=(buffer<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;value+=ALPHABET[(buffer>>bits)&31];}
  }
  return value.match(/.{1,4}/g).join('-');
}
const normalizeCode=value=>{
  const code=typeof value==='string'?value.toUpperCase().replaceAll('-','').replaceAll(' ',''):'';
  demand(code.length===16&&[...code].every(char=>ALPHABET.includes(char)),
    'PAIRING_INVALID','The activation code is invalid or expired.',404);
  return code;
};
const codeHash=(code,secret)=>createHmac('sha256',secret).update(`relay-pairing-v1:${code}`).digest('hex');

export function createDevices(database,config) {
  const available=()=>demand(config.activationEnabled&&config.signingKeys,'ACTIVATION_DISABLED','Device activation is not configured.',503);
  const publicDevice=row=>({id:row.id,name:row.name,created_at:Number(row.created_at),last_seen_at:Number(row.last_seen_at),
    revoked_at:row.revoked_at===null?null:Number(row.revoked_at)});
  return {
    async pairing(session) {
      available();
      const now=Date.now();const code=pairingCode();
      const result=await database.transaction(async tx=>{
        await tx.query('SELECT id FROM relay_accounts WHERE id=$1 FOR UPDATE',[session.account.id]);
        const entitlement=(await tx.query(`SELECT * FROM relay_entitlements WHERE account_id=$1 AND network=$2
          AND expires_at>$3 ORDER BY expires_at DESC LIMIT 1`,[session.account.id,config.network,now])).rows[0];
        demand(entitlement,'ENTITLEMENT_REQUIRED','A current Testnet access record is required before activation.',403);
        await tx.query('UPDATE relay_pairings SET used_at=$1 WHERE account_id=$2 AND used_at IS NULL',[now,session.account.id]);
        return (await tx.query(`INSERT INTO relay_pairings(id,account_id,entitlement_id,code_hash,expires_at,created_at)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING expires_at`,[randomUUID(),session.account.id,entitlement.id,
          codeHash(normalizeCode(code),config.sessionSecret),now+600_000,now])).rows[0];
      });
      return {code,expiresAt:Number(result.expires_at)};
    },
    async claim({code,publicKey,name},ip='unknown') {
      available();
      const normalized=normalizeCode(code);const canonicalKey=normalizePublicKey(publicKey);const fingerprint=keyFingerprint(canonicalKey);
      demand(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=80&&
        !/[\x00-\x1f\x7f]/.test(name),'BAD_DEVICE_NAME','Use a device name of at most 80 characters.');
      const now=Date.now();const window=600_000;
      const bucket=createHmac('sha256',config.sessionSecret).update(`device:${Math.floor(now/window)}:${ip}`).digest('hex');
      const limited=await database.query(`INSERT INTO relay_auth_limits(bucket,count,expires_at) VALUES($1,1,$2)
        ON CONFLICT(bucket) DO UPDATE SET count=relay_auth_limits.count+1 RETURNING count`,[bucket,now+window]);
      demand(limited.rows[0].count<=30,'RATE_LIMITED','Too many activation attempts. Try again in ten minutes.',429);
      return database.transaction(async tx=>{
        const pairing=(await tx.query('SELECT * FROM relay_pairings WHERE code_hash=$1 FOR UPDATE',
          [codeHash(normalized,config.sessionSecret)])).rows[0];
        demand(pairing&&pairing.used_at===null&&Number(pairing.expires_at)>now,
          'PAIRING_INVALID','The activation code is invalid or expired.',404);
        const entitlement=(await tx.query('SELECT * FROM relay_entitlements WHERE id=$1 AND account_id=$2 FOR UPDATE',
          [pairing.entitlement_id,pairing.account_id])).rows[0];
        demand(entitlement&&Number(entitlement.expires_at)>now,'ENTITLEMENT_EXPIRED','The Testnet access record has expired.',403);
        const existing=(await tx.query('SELECT * FROM relay_devices WHERE public_key=$1',[canonicalKey])).rows[0];
        demand(!existing||existing.account_id===pairing.account_id,'PAIRING_INVALID','The activation code is invalid or expired.',404);
        const device=existing||((await tx.query(`INSERT INTO relay_devices(id,account_id,entitlement_id,public_key,name,created_at,last_seen_at)
          VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *`,[randomUUID(),pairing.account_id,entitlement.id,canonicalKey,name.trim(),now])).rows[0]);
        if(existing) await tx.query(`UPDATE relay_devices SET entitlement_id=$1,name=$2,revoked_at=NULL,last_seen_at=$3 WHERE id=$4`,
          [entitlement.id,name.trim(),now,device.id]);
        await tx.query('UPDATE relay_pairings SET used_at=$1 WHERE id=$2',[now,pairing.id]);
        const issued=Math.floor(now/1000);const expires=Math.floor(Math.min(Number(entitlement.expires_at),now+30*86_400_000)/1000);
        const token=signEntitlement(config.signingKeys,{iss:config.origin,aud:'relay-local-agent',sub:pairing.account_id,
          device:device.id,entitlement:entitlement.id,agent:'follow-up-desk',network:entitlement.network,
          device_key:fingerprint,iat:issued,exp:expires,jti:randomUUID()});
        return {token,expiresAt:expires*1000,device:publicDevice({...device,name:name.trim(),last_seen_at:now,revoked_at:null})};
      });
    },
    async list(accountId) {
      const rows=await database.query('SELECT * FROM relay_devices WHERE account_id=$1 ORDER BY created_at DESC',[accountId]);
      return rows.rows.map(publicDevice);
    },
    async revoke(accountId,id) {
      const result=await database.query('UPDATE relay_devices SET revoked_at=COALESCE(revoked_at,$1) WHERE id=$2 AND account_id=$3 RETURNING id',
        [Date.now(),id,accountId]);
      demand(result.rows.length===1,'DEVICE_NOT_FOUND','This device was not found.',404);
    },
    async status(token) {
      available();
      const claims=readEntitlementClaims(token);
      demand(typeof claims.device==='string','BAD_ENTITLEMENT','The activation record is invalid.',403);
      const device=(await database.query('SELECT * FROM relay_devices WHERE id=$1',[claims.device])).rows[0];
      demand(device,'DEVICE_NOT_FOUND','This device is no longer registered.',403);
      const verified=verifyEntitlement(token,{publicKey:publicKeyBase64(config.signingKeys.publicKey),
        kid:config.signingKeys.kid,issuer:config.origin,deviceKey:device.public_key});
      const entitlement=(await database.query('SELECT expires_at FROM relay_entitlements WHERE id=$1 AND account_id=$2',
        [verified.entitlement,verified.sub])).rows[0];
      const active=device.revoked_at===null&&entitlement&&Number(entitlement.expires_at)>Date.now();
      if(active)await database.query('UPDATE relay_devices SET last_seen_at=$1 WHERE id=$2',[Date.now(),device.id]);
      return {active:Boolean(active),revoked:device.revoked_at!==null,expiresAt:verified.exp*1000};
    }
  };
}
