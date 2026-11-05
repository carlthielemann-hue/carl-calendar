import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './scriptroom/Root'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
