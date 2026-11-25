import { randomUUID, randomBytes, createHash, createHmac } from 'node:crypto';
import { demand } from '../errors.js';

export const digestToken = token => createHash('sha256').update(token).digest('hex');

export function createAccounts(database, pi, config) {
  const publicAccount = row => ({id:row.id, username:row.username || null});
  return {
    async signIn(accessToken, ip = 'unknown') {
      demand(config.authEnabled,'AUTH_DISABLED','Pi sign-in is not configured.',503);
      const now = Date.now();
      const window = 600_000;
      const bucket = createHmac('sha256',config.sessionSecret).update(`${Math.floor(now/window)}:${ip}`).digest('hex');
      const limited = await database.query(`INSERT INTO relay_auth_limits(bucket,count,expires_at) VALUES($1,1,$2)
        ON CONFLICT(bucket) DO UPDATE SET count=relay_auth_limits.count+1 RETURNING count`,[bucket,now+window]);
      demand(limited.rows[0].count <= 20,'RATE_LIMITED','Too many sign-in attempts. Try again in ten minutes.',429);
      await database.query('DELETE FROM relay_auth_limits WHERE expires_at<$1',[now]);
      const user = await pi.me(accessToken);
      demand(user && typeof user.uid === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(user.uid),
        'PI_RESPONSE_INVALID','Pi did not return a valid app-specific identity.',502);
      demand(user.username === undefined || (typeof user.username === 'string' && user.username.length <= 120 &&
        !/[\x00-\x1f\x7f]/.test(user.username)), 'PI_RESPONSE_INVALID','Pi returned an invalid username.',502);
      const scopes = Array.isArray(user.credentials?.scopes) ? user.credentials.scopes.filter(scope => typeof scope === 'string') : [];
      let expires = now + 3_600_000;
      if (user.credentials?.valid_until?.iso8601) {
        const validity = Date.parse(user.credentials.valid_until.iso8601);
        demand(Number.isFinite(validity) && validity > now,'PI_AUTH_FAILED','Pi sign-in has expired.',401);
        expires = Math.min(expires,validity);
      }
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      const account = await database.transaction(async tx => {
        await tx.query('DELETE FROM relay_sessions WHERE expires_at<=$1',[now]);
        const result = await tx.query(`INSERT INTO relay_accounts(id,pi_uid,username,created_at) VALUES($1,$2,$3,$4)
          ON CONFLICT(pi_uid) DO UPDATE SET username=COALESCE(EXCLUDED.username,relay_accounts.username) RETURNING *`,
          [randomUUID(),user.uid,user.username || null,now]);
        const row = result.rows[0];
        await tx.query('INSERT INTO relay_sessions(token_hash,account_id,csrf,scopes,expires_at) VALUES($1,$2,$3,$4,$5)',
          [digestToken(token),row.id,csrf,JSON.stringify(scopes),expires]);
        return row;
      });
      return {account:publicAccount(account), token, csrf, expires};
    },
    async session(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      const result = await database.query(`SELECT a.*,s.csrf,s.scopes,s.expires_at FROM relay_sessions s
        JOIN relay_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>$2`,
        [digestToken(token),Date.now()]);
      const row = result.rows[0];
      return row ? {account:publicAccount(row), uid:row.pi_uid, csrf:row.csrf,
        scopes:JSON.parse(row.scopes), expires:Number(row.expires_at)} : null;
    },
    logout: token => database.query('DELETE FROM relay_sessions WHERE token_hash=$1',[digestToken(token)])
  };
}
