import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The clients are React components; the server they talk to runs in the
    // same process, on a real socket, over a real loopback port.
    environment: 'jsdom',
    // A full match drives dozens of round trips through a real socket.
    testTimeout: 30_000,
  },
})
