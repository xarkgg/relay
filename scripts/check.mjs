import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let count = 0;
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.ssr', 'out'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(m?js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    }
  }
}
for (const dir of ['server', 'shared', 'frontend', 'scripts', 'tests']) await check(dir);
console.log(`Syntax checked: ${count} files.`);
const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'frontend/tsconfig.json', '--noEmit'], { stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status || 1);
console.log('Type checked: frontend.');
