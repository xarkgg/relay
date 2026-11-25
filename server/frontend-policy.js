import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontendPolicy } from '../shared/frontend-policy.js';

export function localFrontendPolicy(directory, parents) {
  let scriptHashes = [];
  try { scriptHashes = JSON.parse(readFileSync(join(directory, '.relay-csp.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return frontendPolicy(scriptHashes, ["'self'", ...parents]);
}
