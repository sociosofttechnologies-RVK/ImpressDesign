import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API (server/) runs on :4000; /api calls are proxied to it.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
});
