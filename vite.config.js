import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: course-file:",
  "media-src 'self' course-file:",
  "connect-src 'self' course-file:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${productionCsp.replaceAll('"', '&quot;')}">`);
      }
    }
  ],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true }
});
