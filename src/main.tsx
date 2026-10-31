import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global resilience guard to silence cross-origin script error noise and unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (e: ErrorEvent) => {
      const msg = e.message || '';
      if (msg === 'Script error.' || msg === 'Script error' || !e.filename || e.lineno === 0) {
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        return true;
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (e.reason && (e.reason.message === 'Script error.' || e.reason.name === 'AbortError')) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

