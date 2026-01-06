import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vite configuration for Chrome Extension development
 * 
 * Builds three separate entry points:
 * 1. popup - React UI for the extension popup
 * 2. background - Service worker for API calls
 * 3. contentScript - Injected into web pages for text selection
 */
export default defineConfig({
    plugins: [react()],
    base: './', // Use relative paths for Chrome extension
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'popup.html'),
                background: resolve(__dirname, 'src/background/index.ts'),
                contentScript: resolve(__dirname, 'src/content/contentScript.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name].[hash].js',
                assetFileNames: 'assets/[name].[ext]',
            },
        },
        // Chrome extensions need to be self-contained
        cssCodeSplit: false,
        sourcemap: true,
    },
    // Ensure proper resolution for Chrome extension environment
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
