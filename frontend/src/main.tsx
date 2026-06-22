import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { wireLayoutPersistence } from './stores/appStore'
import { initSessionLock } from './lib/sessionLock'
import './index.css'

wireLayoutPersistence()
// Cross-window per-session lock: only one window holds a given terminal's
// socket at a time (focus-arbitrated), killing the multi-window tmux flicker.
initSessionLock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
