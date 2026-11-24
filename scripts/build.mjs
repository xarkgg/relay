import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('shared', 'dist/shared', { recursive: true });
const html = await readFile('public/index.html', 'utf8');
await writeFile('dist/index.html', html.replace('data-mode="local"', 'data-mode="catalogue"'));
console.log('Built a catalogue-only site in dist. No workspace database or documents included.');
