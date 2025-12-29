

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

// --- CRITICAL POLYFILLS START ---
import { Buffer } from 'buffer';

// Fix 1: Buffer (Essential for Encryption)
// @ts-ignore
window.Buffer = Buffer;

// Fix 2: Global (Essential for some libraries)
// @ts-ignore
window.global = window;

// Fix 3: Process (Safe polyfill to avoid overwriting existing environment variables like API_KEY)
// Fix: Added casting to any on window to avoid TypeScript property access errors
// @ts-ignore
if (typeof (window as any).process === 'undefined') {
  // @ts-ignore
  (window as any).process = { env: {} };
} else if (typeof (window as any).process.env === 'undefined') {
  // @ts-ignore
  (window as any).process.env = {};
}
// --- CRITICAL POLYFILLS END ---

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
