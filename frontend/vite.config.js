import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react'

// Ports for `npm run dev` (set them as environment variables or in frontend/.env.local):
//   DEV_PORT     port of the Vite dev server (default 5173)
//   BACKEND_PORT port of the Spring Boot backend that /api is proxied to (default 8080)
export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), '')
    return {
        plugins: [react()],
        server: {port: Number(env.DEV_PORT) || 5173, proxy: {'/api': `http://localhost:${env.BACKEND_PORT || 8080}`}},
        build: {outDir: '../backend/src/main/resources/static', emptyOutDir: true},
        test: {
            environment: 'jsdom', globals: true, testTimeout:20000, setupFiles: './src/test/setup.js', restoreMocks: true,
            coverage: {
                provider: 'v8',
                include: ['src/**'],
                exclude: ['src/test/**', 'src/main.jsx', '**/*.test.*'],
                reporter: ['text', 'html'],
                thresholds: {lines: 95, statements: 95, functions: 95, branches: 90}
            }
        }
    }
})
