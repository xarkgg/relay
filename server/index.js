import { openStore } from './store.js';
import { createApp } from './app.js';
import { createModel } from './model.js';
import { createActivation } from './activation.js';

if (process.env.VERCEL) throw new Error('The local runtime cannot run on Vercel. Deploy the catalogue build instead.');
process.umask(0o077);
const port = Number(process.env.RELAY_PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('RELAY_PORT must be between 1024 and 65535.');
const store = openStore(process.env.RELAY_DB || 'data/relay.db');
const model = createModel({ url: process.env.RELAY_MODEL_URL, name: process.env.RELAY_MODEL_NAME });
const activation=createActivation(store,{commerceOrigin:process.env.RELAY_COMMERCE_ORIGIN,
  publicKey:process.env.RELAY_ENTITLEMENT_PUBLIC_KEY,kid:process.env.RELAY_ENTITLEMENT_KID});
const { app, service } = createApp({ store, model,
  activation,
  embedOrigins: (process.env.RELAY_EMBED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
const server = app.listen(port, process.env.RELAY_HOST || '127.0.0.1', () => {
  console.log(`Relay workspace: http://127.0.0.1:${port}`);
  console.log(model.configured ? 'Local model configured; check availability in the workspace.' : 'Template workflow available. No model configured.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  service.stop();
  server.close(() => { store.close(); process.exit(0); });
});
