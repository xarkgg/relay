import { parseCsv, followUps, formatAmount } from '../shared/invoices.js';
import { AGENT, checkGrant, makeGrant, permittedInput, presentGrant, revokeGrant } from './grants.js';
import { hash, id } from './store.js';
import { RelayError, demand } from './errors.js';

export function createService(store, model, activation = {require(){}}) {
  const active = new Map();
  const denied = (grantId, error, runId = null) => store.event('action.refused', {
    grantId, runId, detail: { code: error.code || 'INVALID_REQUEST' }
  });
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    store,
    model,
    importCsv({ name, content }) {
      demand(typeof name === 'string' && name.trim().length > 0 && name.length <= 120 &&
        !/[\x00-\x1f\x7f]/.test(name), 'BAD_NAME', 'Use a short file name.');
      let invoices;
      try { invoices = parseCsv(content); }
      catch (error) { throw new RelayError('BAD_CSV', error.message); }
      const inputId = id('in');
      store.db.prepare('INSERT INTO imports(id,name,content,digest,created_at) VALUES(?,?,?,?,?)')
        .run(inputId, name.trim(), content, hash(content), Date.now());
      store.event('import.created', { detail: { inputId, count: invoices.length } });
      return { id: inputId, name: name.trim(), count: invoices.length, digest: hash(content) };
    },
    grant: request => makeGrant(store, request),
    revoke(grantId) {
      revokeGrant(store, grantId);
      active.get(grantId)?.abort();
    },
    snapshot() {
      return {
        imports: store.db.prepare('SELECT id,name,digest,created_at FROM imports ORDER BY created_at DESC,rowid DESC').all(),
        grants: store.db.prepare('SELECT * FROM grants ORDER BY created_at DESC,rowid DESC').all().map(row => presentGrant(row)),
        runs: store.db.prepare('SELECT * FROM runs ORDER BY started_at DESC,rowid DESC LIMIT 100').all()
          .map(row => ({ ...row, report: row.report ? JSON.parse(row.report) : null })),
        drafts: store.db.prepare(`SELECT drafts.*, runs.grant_id, runs.mode FROM drafts
          JOIN runs ON runs.id=drafts.run_id ORDER BY runs.started_at DESC,drafts.rowid ASC LIMIT 500`).all(),
        events: store.db.prepare('SELECT * FROM events ORDER BY seq DESC LIMIT 100').all()
          .map(row => ({ ...row, detail: JSON.parse(row.detail) }))
      };
    },
    async run({ grantId, mode = 'template' }) {
      demand(['template', 'local-model'].includes(mode), 'BAD_MODE', 'Choose templates or the local model.');
      let runId;
      try {
        demand(!active.has(grantId), 'RUN_BUSY', 'This grant already has a running task.', 409);
        if (mode === 'local-model') activation.require(AGENT.id);
        const controller = new AbortController();
        const { grant, inputs } = store.transaction(() => {
          const grant = checkGrant(store, grantId, 'read_invoices');
          checkGrant(store, grantId, 'draft_reminders');
          demand(grant.used_runs < grant.max_runs, 'RUN_LIMIT', 'This grant has used all its runs.', 403);
          const inputs = JSON.parse(grant.inputs).map(input => permittedInput(store, grantId, input.id));
          runId = id('run');
          store.db.prepare('UPDATE grants SET used_runs=used_runs+1 WHERE id=?').run(grantId);
          store.db.prepare("INSERT INTO runs(id,grant_id,mode,state,started_at) VALUES(?,?,?,'running',?)")
            .run(runId, grantId, mode, Date.now());
          store.event('run.started', { grantId, runId, detail: { mode } });
          return { grant, inputs };
        });
        active.set(grantId, controller);
        const invoices = inputs.flatMap(input => parseCsv(input.content).map(invoice => ({
          ...invoice, inputId: input.id, inputName: input.name
        })));
        demand(new Set(invoices.map(invoice => invoice.id)).size === invoices.length,
          'DUPLICATE_INVOICE', 'Selected registers repeat an invoice ID. Choose a non-overlapping set.');
        const report = followUps(invoices, today());
        const selected = report.due.slice(0, grant.max_drafts);
        let drafts;
        if (mode === 'local-model' && selected.length) {
          drafts = await model.draft(selected, controller.signal);
        }
        else drafts = selected.map(invoice => ({ invoiceId: invoice.id,
          body: `Hello ${invoice.customer}, a quick reminder about invoice ${invoice.id} for ${formatAmount(invoice.amountStroops)} Pi, due ${invoice.dueDate}. Could you share an update when you have a moment? Thank you.` }));
        store.transaction(() => {
          checkGrant(store, grantId, 'draft_reminders');
          if (mode === 'local-model') activation.require(AGENT.id);
          for (const draft of drafts) {
            const source = selected.find(invoice => invoice.id === draft.invoiceId);
            store.db.prepare(`INSERT INTO drafts(id,run_id,input_id,invoice_id,customer,source_row,body,digest)
              VALUES(?,?,?,?,?,?,?,?)`).run(id('draft'), runId, source.inputId, source.id,
              source.customer, source.sourceRow, draft.body, hash(draft.body));
          }
          store.db.prepare("UPDATE runs SET state='completed',report=?,finished_at=? WHERE id=?")
            .run(JSON.stringify({ ...report, omittedDrafts: Math.max(0, report.due.length - selected.length) }), Date.now(), runId);
          store.event('run.completed', { grantId, runId, detail: { draftCount: drafts.length, mode } });
        });
        return { runId, report };
      } catch (error) {
        // Re-check after asynchronous inference so revocation wins over a model error.
        if (runId) {
          try { checkGrant(store, grantId, 'draft_reminders'); }
          catch (permissionError) { error = permissionError; }
          store.db.prepare('UPDATE runs SET state=?,error_code=?,finished_at=? WHERE id=?')
            .run(error.status === 403 ? 'blocked' : 'failed', error.code || 'RUN_FAILED', Date.now(), runId);
        }
        denied(grantId, error, runId);
        throw error;
      } finally {
        // A rejected concurrent request must not remove the original run's controller.
        if (runId) active.delete(grantId);
      }
    },
    review(draftId, state) {
      demand(['approved', 'dismissed', 'pending'].includes(state), 'BAD_REVIEW', 'Choose an approval or dismissal.');
      const draft = store.db.prepare('SELECT * FROM drafts WHERE id=?').get(draftId);
      demand(draft, 'DRAFT_NOT_FOUND', 'Draft was not found.', 404);
      demand(hash(draft.body) === draft.digest, 'DRAFT_CHANGED', 'This draft has changed. Run the agent again.', 409);
      store.db.prepare('UPDATE drafts SET state=?,approved_digest=? WHERE id=?')
        .run(state, state === 'approved' ? draft.digest : null, draftId);
      store.event('draft.reviewed', { detail: { draftId, state } });
    },
    exportDrafts({ grantId, draftIds }) {
      try {
        checkGrant(store, grantId, 'export_drafts');
        demand(Array.isArray(draftIds) && draftIds.length > 0 && draftIds.length <= 50 &&
          new Set(draftIds).size === draftIds.length, 'BAD_SELECTION', 'Choose one to fifty different approved drafts.');
        const content = draftIds.map(draftId => {
          const draft = store.db.prepare(`SELECT drafts.*,runs.grant_id FROM drafts
            JOIN runs ON runs.id=drafts.run_id WHERE drafts.id=?`).get(draftId);
          demand(draft && draft.grant_id === grantId, 'DRAFT_DENIED', 'This draft is outside the grant.', 403);
          demand(draft.state === 'approved' && draft.approved_digest === hash(draft.body),
            'APPROVAL_REQUIRED', 'Approve each unchanged draft before exporting.', 403);
          return `Invoice ${draft.invoice_id}\nSource: imported row ${draft.source_row}\n\n${draft.body}`;
        }).join('\n\n--------------------\n\n');
        const exportId = id('export');
        store.db.prepare('INSERT INTO exports(id,grant_id,content,created_at) VALUES(?,?,?,?)')
          .run(exportId, grantId, content, Date.now());
        store.event('export.created', { grantId, detail: { exportId, draftCount: draftIds.length } });
        return { id: exportId, url: `/api/exports/${exportId}` };
      } catch (error) { denied(grantId, error); throw error; }
    },
    download(exportId) {
      const record = store.db.prepare('SELECT * FROM exports WHERE id=?').get(exportId);
      demand(record, 'EXPORT_NOT_FOUND', 'Export was not found.', 404);
      try { checkGrant(store, record.grant_id, 'export_drafts'); }
      catch (error) { denied(record.grant_id, error); throw error; }
      return record;
    },
    stop() { for (const controller of active.values()) controller.abort(); }
  };
}
