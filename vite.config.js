import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Increase the maximum file size that can be served
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
      // Increase the maximum file size that can be served
      strict: false,
    },
    // Increase the maximum file size that can be uploaded
    maxRequestSize: '1000mb',
  },
}); 