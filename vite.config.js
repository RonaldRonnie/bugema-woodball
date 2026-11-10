import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Writes dist/sw.js (from src/offline/sw-template.js) so the site works
 * without internet once opened. It saves the main code, the stylesheet and
 * every page — but not the PDF tools, which load only when a PDF is made.
 */
function offlineSupport() {
  return {
    name: 'woodball-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const chunks = new Map(Object.values(bundle).filter((f) => f.type === 'chunk').map((c) => [c.fileName, c]))
      const keep = new Set()
      const withImports = (file) => {
        if (keep.has(file)) return
        keep.add(file)
        const c = chunks.get(file)
        if (!c) return
        for (const f of c.imports) withImports(f)
        for (const f of c.viteMetadata?.importedCss || []) keep.add(f)
        for (const f of c.viteMetadata?.importedAssets || []) keep.add(f)
      }
      for (const entry of [...chunks.values()].filter((c) => c.isEntry)) {
        withImports(entry.fileName)
        for (const f of entry.dynamicImports) {
          if (/[/\\]src[/\\]pages[/\\]/.test(chunks.get(f)?.facadeModuleId || '')) withImports(f)
        }
      }
      for (const f of Object.values(bundle)) if (f.type === 'asset' && f.fileName.endsWith('.css')) keep.add(f.fileName)
      const precache = ['index.html', 'favicon.svg', ...[...keep].sort()]
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      const template = readFileSync(new URL('./src/offline/sw-template.js', import.meta.url), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      })
    },
  }
}

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/.
// The deploy workflow sets VITE_BASE_PATH to "/<repo>/" automatically.
// Without it we fall back to a relative base ("./"), which also works on
// static hosts because HashRouter keeps every route on index.html.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react(), offlineSupport()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
})
