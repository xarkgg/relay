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

test('inline scripts are authorized by their exact hashes only', () => {
  const code = 'window.relayReady=true;';
  const hash = `sha256-${createHash('sha256').update(code).digest('base64')}`;
  const html = `<script src="/external.js"></script><script>${code}</script><script>${code}</script>`;
  assert.deepEqual(inlineScriptHashes(html), [hash]);
  const policy = frontendPolicy([hash]);
  assert.ok(policy.includes(`'${hash}'`));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.notDeepEqual(inlineScriptHashes(`<script>${code} </script>`), [hash]);
  assert.throws(() => frontendPolicy(["'unsafe-inline' ; connect-src *"]));
});

test('frontend uses Vite, React, TypeScript, and Tailwind without a global reset', async () => {
  const config = await readFile(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /@vitejs\/plugin-react/);
  assert.match(config, /@tailwindcss\/vite/);
  assert.match(config, /outDir: 'out'/);
  assert.match(config, /appType: 'custom'/);
  const css = await readFile(new URL('../frontend/src/tailwind.css', import.meta.url), 'utf8');
  assert.match(css, /tailwindcss\/utilities\.css/);
  assert.doesNotMatch(css, /@import\s+['"]tailwindcss(?:\/preflight\.css)?['"]/);
  const html = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /Analytics|@vercel\/analytics/);
  const marketplace = await readFile(new URL('../frontend/src/components/marketplace.tsx', import.meta.url), 'utf8');
  const profileMenu = await readFile(new URL('../frontend/src/components/profile-menu.tsx', import.meta.url), 'utf8');
  assert.match(profileMenu, /\/placeholder-user\.jpg/);
  assert.doesNotMatch(profileMenu, /https?:\/\//);
  assert.doesNotMatch(marketplace, /https?:\/\//);
});

test('frontend source, assets and runtime versions match their recorded baseline', async () => {
  const reference = JSON.parse(await readFile(new URL('./fixtures/frontend-ui.json', import.meta.url), 'utf8'));
  const files = { marketplace:'src/components/marketplace.tsx', styles:'src/styles.css', privacy:'src/pages/privacy.tsx', notFound:'src/pages/not-found.tsx' };
  for (const [name, path] of Object.entries(files)) {
    const content = await readFile(new URL(`../frontend/${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), reference.fingerprints[name], `${name} changed from the recorded frontend baseline`);
  }
  for (const [name, digest] of Object.entries(reference.assets)) {
    const content = await readFile(new URL(`../frontend/public/${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), digest, `${name} changed`);
  }
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  for (const [name, version] of Object.entries(reference.versions)) assert.equal(lock.packages[`node_modules/${name}`].version, version);
  assert.equal(lock.packages['node_modules/next'], undefined);
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
