import { demand } from '../errors.js';
import { parseAmount, formatAmount } from '../../shared/invoices.js';
import { isPiAddress } from '../../shared/pi-address.js';
import { loadEntitlementKeys } from '../entitlement-token.js';

function flag(value) {
  demand(value === undefined || ['0','1'].includes(value), 'BAD_CONFIG', 'Feature flags must be 0 or 1.');
  return value === '1';
}

export function commerceConfig(env = process.env) {
  const authEnabled = flag(env.RELAY_PI_AUTH_ENABLED);
  const checkoutEnabled = flag(env.RELAY_PI_CHECKOUT_ENABLED);
  const sandbox = flag(env.RELAY_PI_SANDBOX ?? '1');
  const network = env.RELAY_PI_NETWORK || 'Pi Testnet';
  const sessionSecret = env.RELAY_SESSION_SECRET || '';
  const url = env.RELAY_COMMERCE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://127.0.0.1:4311');
  const origin = new URL(url).origin;
  demand(!env.VERCEL || origin.startsWith('https:'),'BAD_CONFIG','Serverless accounts require an HTTPS origin.');
  demand(url.replace(/\/$/,'') === origin, 'BAD_CONFIG', 'RELAY_COMMERCE_URL must be an exact origin.');
  demand(['Pi Testnet','Pi Network'].includes(network), 'BAD_CONFIG', 'Choose Pi Testnet or Pi Network.');
  demand(!authEnabled || sessionSecret.length >= 32, 'BAD_CONFIG', 'Pi sign-in requires a session secret of at least 32 characters.');
  demand(!checkoutEnabled || (authEnabled && network === 'Pi Testnet'), 'BAD_CONFIG',
    'Checkout requires sign-in and is Testnet-only until device activation is available.');
  demand(!checkoutEnabled || sandbox,'BAD_CONFIG','Testnet checkout requires Pi SDK sandbox mode.');
  const apiKey = env.RELAY_PI_API_KEY || '';
  const merchant = env.RELAY_PI_MERCHANT_ADDRESS || '';
  const price = env.RELAY_PI_PRICE ? parseAmount(env.RELAY_PI_PRICE) : null;
  demand(!checkoutEnabled || (apiKey && isPiAddress(merchant) && price),
    'BAD_CONFIG', 'Testnet checkout requires the app API key, merchant address, and an explicit Pi price.');
  if (price) demand(Number(Number(formatAmount(price)).toFixed(7)) === Number(formatAmount(price)) &&
    parseAmount(Number(formatAmount(price)).toFixed(7)) === price, 'BAD_CONFIG', 'The Pi price must round-trip exactly through the SDK.');
  const origins = new Set([origin]);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (env.VERCEL_URL) origins.add(`https://${env.VERCEL_URL}`);
  const activationEnabled=flag(env.RELAY_DEVICE_ACTIVATION_ENABLED);
  demand(!activationEnabled||checkoutEnabled,'BAD_CONFIG','Device activation requires Testnet checkout.');
  const signingKeys=activationEnabled?loadEntitlementKeys({privateKey:env.RELAY_ENTITLEMENT_PRIVATE_KEY,
    publicKey:env.RELAY_ENTITLEMENT_PUBLIC_KEY,kid:env.RELAY_ENTITLEMENT_KID}):null;
  return {
    authEnabled, checkoutEnabled, sessionSecret, network, origin, origins,
    sandbox, apiKey, merchant, price,
    pgTlsVerify: flag(env.RELAY_PG_TLS_VERIFY ?? '1'),
    activationEnabled,signingKeys,
    databaseUrl: env.RELAY_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || '',
    serverless: Boolean(env.VERCEL),
    pgliteDir: env.RELAY_COMMERCE_PGLITE_DIR || 'data/commerce'
  };
}

export const COMMERCE_CSP = "default-src 'self'; script-src 'self' https://sdk.minepi.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.minepi.com https://sdk.minepi.com; frame-src https://sdk.minepi.com https://sandbox.minepi.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://sandbox.minepi.com";
export const COMMERCE_PERMISSIONS = 'camera=(), microphone=(), geolocation=()';
