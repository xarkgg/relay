import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('.', import.meta.url))

function prerenderedPages(): Plugin {
  return {
    name: 'relay-prerendered-pages',
    configureServer(server) {
      return () =>
        server.middlewares.use(async (req, res, next) => {
          try {
            const pathname = new URL(req.url || '/', 'http://localhost')
              .pathname
            if (pathname === '/privacy') {
              res.statusCode = 308
              res.setHeader('Location', '/privacy/')
              res.end()
              return
            }
            const template = await server.transformIndexHtml(
              req.url || '/',
              await readFile(resolve(root, 'index.html'), 'utf8'),
            )
            const { render } = await server.ssrLoadModule(
              '/src/entry-server.tsx',
            )
            const page = render(pathname)
            const exportedError = [
              '/404.html',
              '/404/',
              '/404/index.html',
              '/_not-found/',
              '/_not-found/index.html',
            ].includes(pathname)
            res.statusCode = exportedError ? 200 : page.status
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(
              req.method === 'HEAD'
                ? undefined
                : template
                    .replace('<!--app-head-->', () => page.headHtml)
                    .replace('<!--app-html-->', () => page.appHtml),
            )
          } catch (error) {
            server.ssrFixStacktrace(error as Error)
            next(error)
          }
        })
    },
  }
}

export default defineConfig({
  root,
  appType: 'custom',
  plugins: [react(), tailwindcss(), prerenderedPages()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { port: 3000 },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    target: ['chrome111', 'edge111', 'firefox111', 'safari16.4'],
    cssMinify: false,
  },
})
