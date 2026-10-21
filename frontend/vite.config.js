import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {proxy: {'/api': 'http://localhost:8080'}},
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
})
