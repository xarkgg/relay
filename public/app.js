import { parseCsv, followUps, formatAmount, sampleCsv } from '/shared/invoices.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const local = document.body.dataset.mode === 'local';
let state = { imports: [], grants: [], drafts: [], runs: [], events: [], activation:{configured:false,active:false} };
let csrf = '', running = false;
const time = value => new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });

function errorMessage(message, selector = '#error') {
  const node = $(selector);
  node.textContent = message || '';
  node.hidden = !message;
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method, credentials:'same-origin',
    headers: body ? { 'Content-Type':'application/json', 'X-Relay-CSRF':csrf } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'This action could not finish.');
  return result;
}

function reportHtml(report) {
  const rows = report.due.map(invoice => `<div class="invoice-row"><div><strong>${escape(invoice.customer)}</strong><small>${escape(invoice.id)} · ${escape(invoice.inputName || 'Sample register')}, row ${invoice.sourceRow}</small></div><div>${escape(formatAmount(invoice.amountStroops))} Pi<small>${invoice.overdueDays ? `${invoice.overdueDays} days overdue` : 'Due today'}</small></div></div>`).join('');
  return `<div class="report"><div class="totals"><div class="total"><strong>${report.due.length}</strong><span>due for follow-up</span></div><div class="total"><strong>${escape(formatAmount(report.totalStroops))} Pi</strong><span>from unpaid records</span></div></div>${rows || '<p>No unpaid invoices are due today.</p>'}<p class="muted">${report.paidCount} marked paid · ${report.futureCount} not due yet. Status comes from the register.</p></div>`;
}

function paint() {
  const previous = $('#active-grant').value;
  $('#input-count').textContent = state.imports.length;
  $('#inputs').innerHTML = state.imports.map(input => `<div class="input-item">${escape(input.name)}<small>Immutable import · ${escape(input.digest.slice(0, 10))}</small></div>`).join('');
  $('#grants').innerHTML = state.grants.map(grant => `<div class="grant"><div class="grant-header"><strong>Follow-up Desk</strong><span class="state ${grant.state}">${grant.state}</span></div><p>${grant.inputs.map(input => escape(input.name)).join(', ')}</p><p>${grant.used_runs}/${grant.max_runs} runs · ${grant.max_drafts} drafts per run</p><p>Expires ${escape(time(grant.expires_at))}</p><p>${grant.tools.map(tool => escape(tool.replaceAll('_',' '))).join(' · ')}</p>${grant.state === 'active' ? `<button data-action="revoke" data-id="${escape(grant.id)}">Revoke permission</button>` : ''}</div>`).join('') || '<p class="muted">No permissions granted yet.</p>';
  const active = state.grants.filter(grant => grant.state === 'active');
  $('#active-grant').innerHTML = active.map((grant, i) => `<option value="${escape(grant.id)}">Grant ${i + 1} · ${escape(grant.inputs.map(input => input.name).join(', '))}</option>`).join('') || '<option value="">Create a grant to start</option>';
  if (active.some(grant => grant.id === previous)) $('#active-grant').value = previous;
  $('#run').disabled = !active.length || running;
  $('#run').textContent = running ? 'Preparing…' : 'Prepare queue';
  const completed = state.runs.find(run => run.state === 'completed');
  $('#results').innerHTML = completed ? `<p class="eyebrow">Last completed run · ${escape(time(completed.finished_at))} · ${completed.mode === 'template' ? 'Templates, no AI call' : 'Local model'}</p>${reportHtml(completed.report)}${completed.report.omittedDrafts ? `<p class="muted">${completed.report.omittedDrafts} due invoices have no draft because of the grant's per-run limit.</p>` : ''}` : '<div class="panel"><h3>Your queue will appear here.</h3><p class="muted">Import a register, grant the agent a scope, then prepare a queue. Nothing runs automatically.</p></div>';
  $('#drafts').innerHTML = state.drafts.map(draft => `<article class="panel draft" data-draft="${escape(draft.id)}"><div class="draft-header"><h4>${escape(draft.invoice_id)} · ${escape(draft.customer)}</h4><span class="badge">${draft.state}</span></div><p class="muted">${draft.mode === 'template' ? 'Template · no AI call' : 'Local model draft'} · source row ${draft.source_row}</p><p class="draft-text">${escape(draft.body)}</p><div class="draft-actions"><button class="secondary" data-action="approve" data-id="${escape(draft.id)}" ${draft.state === 'approved' ? 'disabled' : ''}>Approve draft</button><button class="secondary" data-action="dismiss" data-id="${escape(draft.id)}" ${draft.state === 'dismissed' ? 'disabled' : ''}>Dismiss</button></div></article>`).join('') + active.map(grant => {
    const count = state.drafts.filter(draft => draft.grant_id === grant.id && draft.state === 'approved').length;
    return count ? `<div class="export-bar"><span>${count} approved drafts in this grant</span><button class="primary" data-action="export" data-id="${escape(grant.id)}">Export approved drafts</button></div>` : '';
  }).join('');
  const labels = { 'import.created':'Register imported', 'grant.created':'Permission granted', 'grant.revoked':'Permission revoked', 'run.started':'Run started', 'run.completed':'Run completed', 'action.refused':'Action refused', 'draft.reviewed':'Draft reviewed', 'export.created':'Approved drafts exported', 'device.activated':'Device activated', 'device.revoked':'Device revoked' };
  $('#events').innerHTML = state.events.map(event => `<li><span>${escape(labels[event.type] || event.type)}${event.detail.code ? ` · ${escape(event.detail.code)}` : ''}${event.detail.state ? ` · ${escape(event.detail.state)}` : ''}</span><time datetime="${new Date(event.created_at).toISOString()}">${escape(time(event.created_at))}</time></li>`).join('') || '<li>No activity yet.</li>';
  const activation=state.activation||{configured:false,active:false};
  $('#activation-form').hidden=!activation.configured||activation.active;
  $('#activation-state').textContent=!activation.configured?'Not configured':activation.active?'Active':activation.revoked?'Revoked':'Not active';
  $('#activation-state').className=`state ${activation.active?'':'revoked'}`;
  $('#activation-copy').textContent=!activation.configured?'The operator has not configured signed device activation.':activation.active
    ?`Active until ${time(activation.expiresAt)}${activation.offline?' · status not checked online':''}. Local AI is unlocked.`
    :activation.revoked?'This device was revoked. Create a new code from the storefront to activate it again.'
    :'Enter the one-time code from your signed-in Relay storefront.';
}

async function refresh() { state = await api('/workspace'); paint(); }

async function action(fn) {
  errorMessage('');
  try { await fn(); }
  catch (error) { errorMessage(error.message); }
}

$('#preview-open').addEventListener('click', () => {
  $('#preview-results').innerHTML = reportHtml(followUps(parseCsv(sampleCsv()), new Date().toISOString().slice(0, 10)));
  $('#preview-dialog').showModal();
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

if (!local) {
  document.querySelectorAll('[data-local]').forEach(node => { node.hidden = true; });
  $('#catalogue-note').hidden = false;
  $('#location').textContent = 'Public preview';
  await action(async()=>{
    const {mountCommerce}=await import('/commerce.js');
    await mountCommerce();
  });
} else {
  await action(async () => {
    const initial = await api('/bootstrap');
    csrf = initial.csrf;
    state = initial;
    paint();
    if (initial.model.configured) {
      const health = await api('/model');
      $('#model-choice').disabled = !health.available;
      $('#model-state').textContent = health.available ? health.name : 'Configured, not available';
    }
    if(initial.activation?.configured) {
      state.activation=await api('/activation');
      paint();
    }
  });
}

if (local) {
  $('#refresh').addEventListener('click', () => action(refresh));
  $('#active-grant').addEventListener('change', () => { $('#run').disabled = !$('#active-grant').value || running; });
  $('#file-input').addEventListener('change', () => action(async () => {
    const file = $('#file-input').files[0];
    if (!file) return;
    if (file.size > 256 * 1024) throw new Error('Choose a CSV smaller than 256 KB.');
    const content = await file.text();
    parseCsv(content);
    await api('/imports', { method:'POST', body:{ name:file.name, content } });
    $('#file-input').value = '';
    await refresh();
  }));
  $('#import-sample').addEventListener('click', () => action(async () => {
    await api('/imports', { method:'POST', body:{ name:'Sample invoices.csv', content:sampleCsv() } });
    await refresh();
  }));
  $('#grant-open').addEventListener('click', () => {
    if (!state.imports.length) return errorMessage('Import a register before creating a grant.');
    $('#grant-inputs').innerHTML = state.imports.map((input, index) => `<label class="check"><input type="checkbox" name="inputId" value="${escape(input.id)}" ${index === 0 ? 'checked' : ''}>${escape(input.name)}</label>`).join('');
    errorMessage('', '#grant-error');
    $('#grant-dialog').showModal();
  });
  $('#grant-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      const grant = await api('/grants', { method:'POST', body:{
        inputIds:data.getAll('inputId'), tools:['read_invoices', ...data.getAll('tool')],
        days:Number(data.get('days')), maxRuns:Number(data.get('maxRuns')), maxDrafts:Number(data.get('maxDrafts'))
      } });
      await refresh();
      $('#active-grant').value = grant.id;
      $('#grant-dialog').close();
    } catch (error) { errorMessage(error.message, '#grant-error'); }
    finally { submit.disabled = false; }
  });
  $('#activation-form').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget;
    action(async()=>{
      const data=new FormData(form);
      state.activation=await api('/activation/claim',{method:'POST',body:{code:data.get('code'),name:data.get('name')}});
      form.reset();
      $('#device-name').value='My Relay device';
      paint();
    });
  });
  $('#run').addEventListener('click', () => action(async () => {
    const grantId = $('#active-grant').value;
    const mode = $('input[name=mode]:checked').value;
    running = true;
    paint();
    try { await api('/runs', { method:'POST', body:{ grantId, mode } }); }
    finally { running = false; await refresh(); }
  }));
  $('#workspace').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const { action:kind, id } = button.dataset;
    action(async () => {
      if (kind === 'revoke') await api(`/grants/${id}/revoke`, { method:'POST', body:{} });
      else if (kind === 'approve' || kind === 'dismiss') {
        await api(`/drafts/${id}`, { method:'PATCH', body:{ state:kind === 'approve' ? 'approved' : 'dismissed' } });
      } else if (kind === 'export') {
        const draftIds = state.drafts.filter(draft => draft.grant_id === id && draft.state === 'approved').map(draft => draft.id);
        const result = await api('/exports', { method:'POST', body:{ grantId:id, draftIds } });
        const response = await fetch(result.url, { credentials:'same-origin' });
        if (!response.ok) throw new Error((await response.json()).error);
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = 'relay-follow-ups.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      await refresh();
    });
  });
}
