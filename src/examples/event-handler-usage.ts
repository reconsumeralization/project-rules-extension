import * as vscode from 'vscode';
import {
    NormalizedEvent,
    fromReactEvent,
    fromVSCodeEvent,
    createEnhancedHandler
} from '../utils/eventHandlers';

// Example React component using enhanced event handlers - shown as TypeScript code
// In a real React component, you would use JSX syntax in a .tsx file
export function createReactComponent() {
    // State would be managed with useState in React
    let value = '';
    const setValue = (newValue: string) => { value = newValue; };

    // Create a single handler that works with both React and VSCode events
    const handleChange = createEnhancedHandler<string>(
        newValue => setValue(newValue),
        // Optional transformer (e.g., uppercase conversion)
        val => val.toString().trim()
    );

    // In a real component, this would be JSX
    // Here we just demonstrate the handler usage
    return {
        value,
        handleChange,
        // Example of attaching the handler to a DOM event
        setupDomHandlers: (inputElement: HTMLInputElement, buttonElement: HTMLButtonElement) => {
            inputElement.addEventListener('change', (e) => handleChange(e));
            buttonElement.addEventListener('click', () => {
                // Manually trigger with custom data
                handleChange({ value: 'Button clicked' });
            });
        }
    };
}

// Example VSCode WebView panel using the same handlers
export function createWebviewPanel(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'examplePanel',
        'Example Panel',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    // State for the panel
    let currentValue = '';

    // Create handler with the same API as the React component
    const handleChange = createEnhancedHandler<string>(
        newValue => {
            currentValue = newValue;
            updateContent();
        }
    );

    // Set up message handling from webview
    panel.webview.onDidReceiveMessage(message => {
        // This works with the same handler as React
        handleChange(message);
    });

    // Function to update webview content
    function updateContent() {
        panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <body>
          <input type="text" id="input" value="${currentValue}" />
          <button id="sendButton">Send to Extension</button>
          
          <script>
            const vscode = acquireVsCodeApi();
            const input = document.getElementById('input');
            const button = document.getElementById('sendButton');
            
            // Send input value to extension
            input.addEventListener('input', () => {
              vscode.postMessage({ 
                type: 'change',
                value: input.value 
              });
            });
            
            button.addEventListener('click', () => {
              vscode.postMessage({ 
                type: 'button',
                value: 'Button in webview was clicked' 
              });
            });
          </script>
        </body>
      </html>
    `;
    }

    // Initialize content
    updateContent();

    return panel;
}

// Advanced usage: Manual handling with the normalized event interface
export function advancedEventHandling(event: any) {
    // Determine event source and normalize
    const normalizedEvent: NormalizedEvent =
        event.nativeEvent ? fromReactEvent(event) : fromVSCodeEvent(event);

    // Now you have a consistent interface regardless of source
    console.log(`Event type: ${normalizedEvent.type}`);
    console.log(`Event bubbles: ${normalizedEvent.bubbles}`);

    // Access target properties safely
    const target = normalizedEvent.target as any;
    if (target && target.value) {
        console.log(`Value: ${target.value}`);
    }

    // Call methods safely
    normalizedEvent.preventDefault();
    normalizedEvent.stopPropagation();
} 