import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import App from './App'
import { restoreTheme } from './theme'

const root = document.getElementById('root')
if (!root) throw new Error('The frontend root is missing.')

restoreTheme()
window.addEventListener('pageshow', (event) => {
  if (event.persisted) restoreTheme()
})

hydrateRoot(
  root,
  <StrictMode>
    <App pathname={window.location.pathname} />
  </StrictMode>,
)
