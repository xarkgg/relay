import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('The frontend root is missing.')

hydrateRoot(
  root,
  <StrictMode>
    <App pathname={window.location.pathname} />
  </StrictMode>,
)
