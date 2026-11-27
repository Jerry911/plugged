import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'

// The service worker of the PWA (src/offline/sw.js) as /sw.js, with the files of this build to store at installation and a version that
// changes with them (so a new build replaces the old store). pdf.js (about 2 MB, only to read a PDF as the plan behind a page) is not stored
// at installation: it is fetched, and then kept, the first time it is used.
const onlyOnUse = (name, file) => name.includes('pdf.worker') || (file.type === 'chunk' && (file.moduleIds || []).some((id) => id.includes('/pdfjs-dist/')))
const serviceWorker = () => ({
    name: 'plugged-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
        const files = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
            ...Object.keys(bundle).filter((name) => !name.endsWith('.map') && !onlyOnUse(name, bundle[name])).map((name) => '/' + name)]
        const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
        const source = readFileSync(new URL('./src/offline/sw.js', import.meta.url), 'utf8')
            .replace("'__VERSION__'", JSON.stringify(version))
            .replace("['__PRECACHE__']", JSON.stringify(files))
        this.emitFile({type: 'asset', fileName: 'sw.js', source})
    },
})

export default defineConfig({
    plugins: [react(), serviceWorker()],
    server: {proxy: {'/api': 'http://localhost:8080'}},
    // the libraries that are imported only when they are used (an export, a PDF as plan): prepared when the dev server starts, so the first
    // use does not make it prepare them and reload the page
    optimizeDeps: {include: ['pdfjs-dist', 'jspdf', 'svg2pdf.js', 'fflate', 'qrcode', 'pako']},
    build: {outDir: '../backend/src/main/resources/static', emptyOutDir: true},
    test: {
        include: ['src/**/*.test.{js,jsx}'], // the Playwright tests in /e2e are run by `npm run e2e`
        environment: 'jsdom', globals: true, testTimeout:20000, setupFiles: './src/test/setup.js', restoreMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: ['src/test/**', 'src/main.jsx', 'src/offline/sw.js', '**/*.test.*'],
            reporter: ['text', 'html'],
            thresholds: {lines: 95, statements: 95, functions: 95, branches: 90}
        }
    }
})
