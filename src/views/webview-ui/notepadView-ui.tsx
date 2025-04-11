import React from 'react'
import ReactDOM from 'react-dom/client'
import './notepadView/styles.css'
import NotepadView from './notepadView'

// Declare the global vscode API for TypeScript
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void
      getState: () => any
      setState: (state: any) => void
    }
  }
}

// Initialize VS Code API
window.acquireVsCodeApi = window.acquireVsCodeApi || (() => ({
  postMessage: (message: any) => {
    console.log('Mocked postMessage:', message)
  },
  getState: () => null,
  setState: () => {}
}))

// Create root element if it doesn't exist
const rootElement = document.getElementById('root')
if (!rootElement) {
  const newRoot = document.createElement('div')
  newRoot.id = 'root'
  document.body.appendChild(newRoot)
}

// Initialize React app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
    <NotepadView />
  </React.StrictMode>
) 