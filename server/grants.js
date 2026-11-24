import { demand } from './errors.js';
import { hash, id } from './store.js';

export const AGENT = Object.freeze({
  id: 'follow-up-desk', version: '1', name: 'Follow-up Desk',
  tools: ['read_invoices', 'draft_reminders', 'export_drafts']
});

export function presentGrant(grant, now = Date.now()) {
  return {
    ...grant, inputs: JSON.parse(grant.inputs), tools: JSON.parse(grant.tools),
    state: grant.revoked_at !== null ? 'revoked' : grant.expires_at <= now ? 'expired' : 'active'
  };
}

export function makeGrant(store, request, now = Date.now()) {
  const { inputIds, tools, days = 7, maxRuns = 10, maxDrafts = 3 } = request;
  demand(Array.isArray(inputIds) && inputIds.length > 0 && inputIds.length <= 3 &&
    new Set(inputIds).size === inputIds.length, 'BAD_INPUTS', 'Choose one to three different imports.');
  demand(Array.isArray(tools) && new Set(tools).size === tools.length &&
    tools.includes('read_invoices') && tools.every(tool => AGENT.tools.includes(tool)),
    'BAD_TOOLS', 'Choose only the tools this agent supports.');
  demand(Number.isInteger(days) && days >= 1 && days <= 7,
    'BAD_EXPIRY', 'A grant must expire within one to seven days.');
  demand(Number.isInteger(maxRuns) && maxRuns >= 1 && maxRuns <= 50,
    'BAD_LIMIT', 'Allow between one and fifty runs.');
  demand(Number.isInteger(maxDrafts) && maxDrafts >= 1 && maxDrafts <= 5,
    'BAD_LIMIT', 'Allow between one and five drafts per run.');
  const inputs = inputIds.map(inputId => {
    demand(typeof inputId === 'string', 'BAD_INPUTS', 'Choose a valid import.');
    const input = store.db.prepare('SELECT id,name,digest FROM imports WHERE id=?').get(inputId);
    demand(input, 'IMPORT_NOT_FOUND', 'An import was not found.', 404);
    return input;
  });
  const grantId = id('gr');
  store.db.prepare(`INSERT INTO grants(id,agent,version,inputs,tools,expires_at,max_runs,max_drafts,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(grantId, AGENT.id, AGENT.version, JSON.stringify(inputs),
    JSON.stringify(tools), now + days * 86_400_000, maxRuns, maxDrafts, now);
  store.event('grant.created', { grantId, detail: { inputCount: inputs.length, tools } });
  return presentGrant(store.db.prepare('SELECT * FROM grants WHERE id=?').get(grantId), now);
}

export function checkGrant(store, grantId, tool, now = Date.now()) {
  demand(typeof grantId === 'string', 'GRANT_REQUIRED', 'Choose a permission grant.');
  const grant = store.db.prepare('SELECT * FROM grants WHERE id=?').get(grantId);
  demand(grant, 'GRANT_NOT_FOUND', 'Permission was not found.', 404);
  demand(grant.revoked_at === null, 'GRANT_REVOKED', 'This permission has been revoked.', 403);
  demand(grant.expires_at > now, 'GRANT_EXPIRED', 'This permission has expired.', 403);
  demand(grant.agent === AGENT.id && grant.version === AGENT.version,
    'AGENT_CHANGED', 'This agent version needs a new grant.', 403);
  demand(JSON.parse(grant.tools).includes(tool), 'TOOL_DENIED', 'This tool is outside the grant.', 403);
  for (const snapshot of JSON.parse(grant.inputs)) {
    const input = store.db.prepare('SELECT content,digest FROM imports WHERE id=?').get(snapshot.id);
    demand(input && input.digest === snapshot.digest && hash(input.content) === snapshot.digest,
      'INPUT_CHANGED', 'An input has changed. Create a new grant before continuing.', 403);
  }
  return grant;
}

export function permittedInput(store, grantId, inputId) {
  const grant = checkGrant(store, grantId, 'read_invoices');
  demand(JSON.parse(grant.inputs).some(input => input.id === inputId),
    'INPUT_DENIED', 'This import is outside the grant.', 403);
  return store.db.prepare('SELECT * FROM imports WHERE id=?').get(inputId);
}

export function revokeGrant(store, grantId, now = Date.now()) {
  const grant = store.db.prepare('SELECT id FROM grants WHERE id=?').get(grantId);
  demand(grant, 'GRANT_NOT_FOUND', 'Permission was not found.', 404);
  store.db.prepare('UPDATE grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').run(now, grantId);
  store.event('grant.revoked', { grantId });
}
