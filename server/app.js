import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createService } from './service.js';
import { createModel } from './model.js';
import { RelayError, demand } from './errors.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const sharedDir = fileURLToPath(new URL('../shared/', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');

export function createApp({ store, model = createModel(), embedOrigins = [] }) {
  const service = createService(store, model);
  const sessions = new Map();
  const app = express();
  app.disable('x-powered-by');
  const parents = embedOrigins.map(value => {
    const origin = new URL(value);
    demand(['https:', 'http:'].includes(origin.protocol) && origin.origin === value,
      'BAD_EMBED_ORIGIN', 'Embedding requires exact trusted HTTP origins.');
    return origin.origin;
  });
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' ${parents.join(' ')}`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    try {
      const host = req.get('host') || '';
      const url = new URL(`http://${host}`);
      demand(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.host === host,
        'HOST_DENIED', 'Open Relay through its loopback address.', 403);
      if (req.path.startsWith('/api/')) {
        const origin = req.get('origin');
        demand(!origin || origin === `http://${host}`, 'ORIGIN_DENIED', 'This origin cannot access the workspace.', 403);
        demand(req.get('sec-fetch-site') !== 'cross-site', 'ORIGIN_DENIED', 'Cross-site workspace requests are not allowed.', 403);
        if (!['GET', 'HEAD'].includes(req.method)) {
          demand(origin === `http://${host}`, 'ORIGIN_REQUIRED', 'A same-origin request is required.', 403);
          demand(req.is('application/json'), 'JSON_REQUIRED', 'Send a JSON request.', 415);
        }
      }
      next();
    } catch (error) { next(error); }
  });
  app.get('/healthz', (_req, res) => res.json({ ok: true, mode: 'local' }));
  app.get('/api/bootstrap', (req, res) => {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    const cookie = req.get('cookie')?.match(/(?:^|;\s*)relay_local=([a-f0-9]{64})(?:;|$)/)?.[1];
    let session = cookie ? sessions.get(digest(cookie)) : null;
    if (!session) {
      demand(sessions.size < 100, 'SESSION_LIMIT', 'Too many workspace sessions. Try again later.', 429);
      const token = randomBytes(32).toString('hex');
      session = { csrf: randomBytes(24).toString('hex'), expires: now + 3_600_000 };
      sessions.set(digest(token), session);
      res.set('Set-Cookie', `relay_local=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600`);
    }
    res.json({ csrf: session.csrf, mode: 'local', model: { configured: model.configured, name: model.name },
      ...service.snapshot() });
  });
  app.use('/api', (req, _res, next) => {
    try {
      const cookie = req.get('cookie')?.match(/(?:^|;\s*)relay_local=([a-f0-9]{64})(?:;|$)/)?.[1];
      const session = cookie ? sessions.get(digest(cookie)) : null;
      demand(session && session.expires > Date.now(), 'SESSION_REQUIRED', 'Reload Relay to open a workspace session.', 401);
      if (!['GET', 'HEAD'].includes(req.method)) {
        demand(req.get('x-relay-csrf') === session.csrf, 'CSRF_DENIED', 'Reload Relay before continuing.', 403);
      }
      next();
    } catch (error) { next(error); }
  });
  app.use('/api', express.json({ limit: '300kb', strict: true }));
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && (!req.body || Array.isArray(req.body))) {
      return next(new RelayError('BAD_BODY', 'Send a JSON object.'));
    }
    next();
  });
  app.get('/api/workspace', (_req, res) => res.json(service.snapshot()));
  app.get('/api/model', async (_req, res) => res.json(await model.health()));
  app.post('/api/imports', (req, res) => res.status(201).json(service.importCsv(req.body)));
  app.post('/api/grants', (req, res) => res.status(201).json(service.grant(req.body)));
  app.post('/api/grants/:id/revoke', (req, res) => { service.revoke(req.params.id); res.json({ ok: true }); });
  app.post('/api/runs', async (req, res) => res.status(201).json(await service.run(req.body)));
  app.patch('/api/drafts/:id', (req, res) => { service.review(req.params.id, req.body.state); res.json({ ok: true }); });
  app.post('/api/exports', (req, res) => res.status(201).json(service.exportDrafts(req.body)));
  app.get('/api/exports/:id', (req, res) => {
    const record = service.download(req.params.id);
    res.set('Content-Disposition', `attachment; filename="relay-follow-ups-${record.id}.txt"`);
    res.type('text/plain').send(record.content);
  });
  app.use('/api', (_req, _res, next) => next(new RelayError('NOT_FOUND', 'This endpoint was not found.', 404)));
  app.use('/shared', express.static(sharedDir));
  app.use(express.static(publicDir));
  app.use((_req, _res, next) => next(new RelayError('NOT_FOUND', 'This page was not found.', 404)));
  app.use((error, _req, res, _next) => {
    if (error instanceof RelayError) return res.status(error.status).json({ code: error.code, error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ code: 'TOO_LARGE', error: 'Choose a smaller file.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ code: 'BAD_JSON', error: 'Send valid JSON.' });
    console.error('Relay request failed:', error.name);
    res.status(500).json({ code: 'INTERNAL_ERROR', error: 'This action could not finish.' });
  });
  return { app, service };
}
