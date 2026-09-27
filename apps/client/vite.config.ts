import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mapeia @vtt/protocol para o pacote compartilhado do monorepo
      "@vtt/protocol": fileURLToPath(new URL("../../packages/protocol/index.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
  },
});