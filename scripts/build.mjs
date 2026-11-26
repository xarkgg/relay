import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { deploymentConfig, inlineScriptHashes } from '../shared/frontend-policy.js';

const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'frontend/tsconfig.json', '--noEmit'], { stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status || 1);

const configFile = resolve('frontend/vite.config.ts');
await build({ configFile });
await build({ configFile, publicDir: false, build: {
  ssr: resolve('frontend/src/entry-server.tsx'),
  outDir: resolve('frontend/.ssr'),
  emptyOutDir: true
} });
const { render } = await import(pathToFileURL(resolve('frontend/.ssr/entry-server.js')).href);
const template = await readFile('frontend/out/index.html', 'utf8');
if (!template.includes('<!--app-html-->') || !template.includes('<!--app-head-->')) {
  throw new Error('The pre-render placeholders are missing from the frontend template.');
}
for (const [file, pathname] of Object.entries({
  'index.html': '/',
  'privacy/index.html': '/privacy/',
  'profile/index.html': '/profile/',
  'settings/index.html': '/settings/',
  '404.html': '/404.html',
  '404/index.html': '/404/',
  '_not-found/index.html': '/_not-found/'
})) {
  const page = render(pathname);
  const html = template.replace('<!--app-head-->', () => page.headHtml)
    .replace('<!--app-html-->', () => page.appHtml);
  const output = join('frontend/out', file);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, html);
}

async function pageHashes(directory) {
  const hashes = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hashes.push(...await pageHashes(path));
    else if (entry.name.endsWith('.html')) hashes.push(...inlineScriptHashes(await readFile(path, 'utf8')));
  }
  return hashes;
}

const scriptHashes = [...new Set(await pageHashes('frontend/out'))].sort();
// Express reads this generated manifest; it is not a public asset.
await writeFile('frontend/out/.relay-csp.json', JSON.stringify(scriptHashes));

// Only replace the generated deployment output, not .vercel/project.json or other local settings.
await rm('.vercel/output', { recursive: true, force: true });
await mkdir('.vercel/output', { recursive: true });
await cp('frontend/out', '.vercel/output/static', {
  recursive: true, filter: path => basename(path) !== '.relay-csp.json'
});
await writeFile('.vercel/output/config.json', `${JSON.stringify(deploymentConfig(scriptHashes), null, 2)}\n`);
console.log('Built the static marketplace in frontend/out and .vercel/output. No backend data included.');
