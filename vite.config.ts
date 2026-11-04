import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localFonts } from './scripts/local-fonts';
export default defineConfig({
  plugins: [react(), localFonts()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/tmp/**', '**/output/**', '**/tools/tectonic/**'] }, proxy: { '/api/pink': 'http://127.0.0.1:4179' } },
  preview: { host: '127.0.0.1' },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('katex')) return 'math';
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('jszip') || id.includes('idb')) return 'storage';
          if (id.includes('lucide')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
