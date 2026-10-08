import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// `--mode single` inlines everything into one self-contained HTML file
// (used for the hosted preview). The default build is a normal static SPA.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  base: './',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}))
