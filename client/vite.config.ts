import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://server:3001',
        ws: true,
      },
      // The display client fetches its server-injected room code from here
      // (spec.md's "Join / reconnect") — in dev, client and server are separate
      // origins (docs/agents/running-the-app.md), so this needs forwarding too.
      '/display-config': 'http://server:3001',
    },
  },
  test: {
    environment: 'jsdom',
  },
})
