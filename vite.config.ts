import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// `--mode single` inlines everything into one self-contained HTML file
// (used for the hosted preview). The default build is a normal static SPA.
// PWA manifest only for real deployments — the single-file preview can't serve it.
const pwaLinks = (): Plugin => ({
  name: 'pwa-links',
  transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#09090b' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icon.svg' }, injectTo: 'head' },
  ],
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [pwaLinks()])],
  publicDir: mode === 'single' ? false : 'public',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  base: './',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}))
