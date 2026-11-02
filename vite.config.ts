import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: { hmr: { port: Number(process.env.PORT ?? 3000) + 1 } },
  build: { outDir: '../dist/web', emptyOutDir: true },
});
