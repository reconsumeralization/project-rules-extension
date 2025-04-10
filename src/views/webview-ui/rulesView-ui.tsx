import React from 'react'
import { createRoot } from 'react-dom/client'
import { RulesViewApp } from './rulesView'

// Initialize the React app in the webview
const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <RulesViewApp />
  </React.StrictMode>
) 