import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Defaults to the bare-host dev flow (`npm run dev -w server`, same
// machine); Docker Compose's `client` service overrides this to the
// `server` container's hostname, since containers can't reach each other
// via `localhost`.
const SERVER_ORIGIN = process.env.SERVER_ORIGIN ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: SERVER_ORIGIN,
        ws: true,
      },
      // The display client fetches its server-injected room code from here
      // (spec.md's "Join / reconnect") — in dev, client and server are separate
      // origins (docs/agents/running-the-app.md), so this needs forwarding too.
      '/display-config': SERVER_ORIGIN,
    },
  },
  test: {
    environment: 'jsdom',
  },
});
