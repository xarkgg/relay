import { createHash } from 'node:crypto';

// Authorize any exact build-generated inline scripts rather than arbitrary code.
// The Vite frontend uses external modules, so its generated hash list is empty.
export function inlineScriptHashes(html) {
  return [...new Set([...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, content]) => content && !/\ssrc\s*=/i.test(attributes))
    .map(([, , content]) => `sha256-${createHash('sha256').update(content).digest('base64')}`))].sort();
}

export function frontendPolicy(scriptHashes = [], frameAncestors = ["'none'"]) {
  if (!Array.isArray(scriptHashes) || scriptHashes.some(value =>
    typeof value !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(value))) {
    throw new Error('Invalid frontend script hashes. Rebuild the frontend.');
  }
  const scripts = ["'self'", ...new Set(scriptHashes.map(value => `'${value}'`))].join(' ');
  return `default-src 'self'; script-src ${scripts}; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${frameAncestors.join(' ')}`;
}

export function deploymentConfig(scriptHashes = []) {
  return {
    version: 3,
    routes: [
      {
        src: '/.*',
        headers: {
          'Content-Security-Policy': frontendPolicy(scriptHashes),
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
        },
        continue: true
      },
      { src: '/$', dest: '/index.html' },
      { src: '/privacy$', status: 308, headers: { Location: '/privacy/' } },
      { src: '/privacy/$', dest: '/privacy/index.html' },
      { src: '/profile$', status: 308, headers: { Location: '/profile/' } },
      { src: '/profile/$', dest: '/profile/index.html' },
      { src: '/settings$', status: 308, headers: { Location: '/settings/' } },
      { src: '/settings/$', dest: '/settings/index.html' },
      { handle: 'filesystem' },
      { src: '/.*', status: 404, dest: '/404.html' }
    ],
    cache: ['node_modules/.vite/**']
  };
}
