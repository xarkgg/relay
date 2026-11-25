import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App, { pageForPath } from './App'

export function render(pathname: string) {
  const markup = renderToString(
    <StrictMode>
      <App pathname={pathname} />
    </StrictMode>,
  )
  // React emits resource preload links before the page markup. Preserve the
  // existing image preload in the head without adding a second request.
  const preloads = markup.match(/^(?:<link\b[^>]*\/>)+/)?.[0] || ''
  const notFound = pageForPath(pathname) === 'not-found'
  return {
    appHtml: markup.slice(preloads.length),
    headHtml: `${notFound ? '<meta name="robots" content="noindex" />' : ''}${preloads}`,
    status: notFound ? 404 : 200,
  }
}
