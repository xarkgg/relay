import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deploymentConfig, frontendPolicy, inlineScriptHashes } from '../shared/frontend-policy.js';

test('Vercel uses the static frontend export and generated deployment configuration', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'frontend/out');
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.routes, undefined);
  const output = deploymentConfig();
  assert.equal(output.version, 3);
  assert.deepEqual(output.routes.slice(-2), [{handle:'filesystem'}, {src:'/.*',status:404,dest:'/404.html'}]);
  assert.equal(output.routes[0].src, '/.*');
  assert.equal(output.routes[0].continue, true);
  const csp = output.routes[0].headers['Content-Security-Policy'];
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(output.routes[0].headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(output.routes[0].headers['X-Frame-Options'], undefined);
});

test('inline hydration scripts are authorized by their exact hashes only', () => {
  const code = 'self.__next_f=[];';
  const hash = `sha256-${createHash('sha256').update(code).digest('base64')}`;
  const html = `<script src="/external.js"></script><script>${code}</script><script>${code}</script>`;
  assert.deepEqual(inlineScriptHashes(html), [hash]);
  const policy = frontendPolicy([hash]);
  assert.ok(policy.includes(`'${hash}'`));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.notDeepEqual(inlineScriptHashes(`<script>${code} </script>`), [hash]);
  assert.throws(() => frontendPolicy(["'unsafe-inline' ; connect-src *"]));
});

test('frontend is a static, type-checked Next project without analytics or remote avatars', async () => {
  const config = await readFile(new URL('../frontend/next.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /output: 'export'/);
  assert.doesNotMatch(config, /ignoreBuildErrors/);
  const layout = await readFile(new URL('../frontend/app/layout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /Analytics|@vercel\/analytics/);
  const marketplace = await readFile(new URL('../frontend/components/marketplace.tsx', import.meta.url), 'utf8');
  assert.match(marketplace, /\/placeholder-user\.jpg/);
  assert.doesNotMatch(marketplace, /https?:\/\//);
});

test('Docker builds the frontend before copying only the export into the runtime image', async () => {
  const docker = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const [build, runtime] = docker.split('FROM node:24-bookworm-slim\n');
  assert.match(build, /COPY frontend \.\/frontend/);
  assert.match(build, /COPY scripts\/build\.mjs \.\/scripts\/build\.mjs/);
  assert.match(build, /COPY shared\/frontend-policy\.js \.\/shared\/frontend-policy\.js/);
  assert.match(build, /RUN npm run build/);
  assert.match(runtime, /npm ci --omit=dev/);
  assert.match(runtime, /COPY --from=build \/app\/frontend\/out \.\/frontend\/out/);
  assert.doesNotMatch(runtime, /COPY public/);
});
