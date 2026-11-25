import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { deploymentConfig, inlineScriptHashes } from '../shared/frontend-policy.js';

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'frontend'], {
  stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
});
if (result.status !== 0) process.exit(result.status || 1);

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
