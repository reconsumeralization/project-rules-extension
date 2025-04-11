import React from 'react';
import ReactDOM from 'react-dom/client';
import './mcpProtocolView/styles.css';
import MCPProtocolEditor from './mcpProtocolView';

// Declare the global vscode API for TypeScript
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// Get VS Code API
const vscode = window.acquireVsCodeApi();

// Init React app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <MCPProtocolEditor />
  </React.StrictMode>
); 