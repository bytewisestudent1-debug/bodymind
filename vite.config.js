import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // listen on all interfaces (LAN / tunnel)
    allowedHosts: true, // allow the tunnel's *.trycloudflare.com host
    proxy: {
      // Forward all API calls to the backend so everything is one origin.
      '/log': 'http://localhost:3001',
      '/auth': 'http://localhost:3001',
      '/profile': 'http://localhost:3001',
      '/coach': 'http://localhost:3001',
      '/plan': 'http://localhost:3001',
      '/body-scan': 'http://localhost:3001',
      '/weigh-in': 'http://localhost:3001',
    },
  },
})
