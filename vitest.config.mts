import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Uji basis data berbagi akun penalang uji A dan B. Bila berjalan paralel, data
    // satu file terlihat oleh asersi "hanya baris sendiri" di file lain.
    fileParallelism: false,
  },
  resolve: {
    // Samakan dengan "paths" di tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
