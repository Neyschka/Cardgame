import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import App from './App'
import { createSocket } from './socket'

// Connected once here, at the edge, and passed down — so importing a component
// never opens a socket as a side effect.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App socket={createSocket()} />
  </StrictMode>,
)
