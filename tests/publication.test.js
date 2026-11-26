import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMMERCE_CSP,COMMERCE_PERMISSIONS } from '../server/commerce/config.js';

test('Vercel serves the generated storefront and refuses unknown workspace routes', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.framework, null);
  assert.deepEqual(config.routes.slice(1), [{src:'/api/commerce/(.*)',dest:'/api/commerce?relay_route=$1'},
    {handle:'filesystem'}, {src:'/.*',status:404}]);
  assert.equal(config.routes[0].src,'/.*');
  assert.equal(config.routes[0].continue,true);
  assert.equal(config.headers,undefined);
  const csp = config.routes[0].headers['Content-Security-Policy'];
  assert.match(csp, /script-src 'self'/);
  assert.equal(csp,COMMERCE_CSP);
  assert.equal(config.routes[0].headers['X-Content-Type-Options'],'nosniff');
  assert.equal(config.routes[0].headers['Permissions-Policy'],COMMERCE_PERMISSIONS);
});
