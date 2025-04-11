import * as vscode from 'vscode';
import {
    NormalizedEvent,
    fromVSCodeEvent,
    createEnhancedHandler
} from '../utils/eventHandlers';

/**
 * Create a VSCode webview panel with enhanced event handling
 */
export function createFormWebviewPanel(context: vscode.ExtensionContext) {
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'formPanel',
        'Interactive Form',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        }
    );

    // Form data state
    let formState = {
        username: '',
        password: '',
        rememberMe: false,
        selectedOption: 'option1'
    };

    // Create enhanced handlers for form fields
    const handleTextInput = createEnhancedHandler<string>((value: string) => {
        // We'll access the field name from the message when we call this handler
        const fieldName = currentField;
        if (fieldName) {
            formState = { ...formState, [fieldName]: value };
            vscode.window.showInformationMessage(`Updated ${fieldName} to: ${value}`);
        }
    });

    const handleCheckbox = createEnhancedHandler<boolean>((checked: boolean) => {
        formState.rememberMe = checked;
        vscode.window.showInformationMessage(`Updated Remember Me to: ${checked}`);
    });

    const handleSelectChange = createEnhancedHandler<string>((option: string) => {
        formState.selectedOption = option;
        vscode.window.showInformationMessage(`Selected option: ${option}`);
    });

    // Track current field being edited
    let currentField = '';

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(message => {
        if (message.command === 'submitForm') {
            // Convert to normalized event
            const normalizedEvent = fromVSCodeEvent(message);

            // Log event details
            console.log(`Form submitted with event type: ${normalizedEvent.type}`);
            console.log(`Form data: ${JSON.stringify(formState, null, 2)}`);

            // Show success message
            vscode.window.showInformationMessage('Form submitted successfully!');
            return;
        }

        // Handle different input types
        switch (message.type) {
            case 'text':
                currentField = message.field; // Set current field before handling
                handleTextInput(message.value);
                break;
            case 'checkbox':
                handleCheckbox(message.checked);
                break;
            case 'select':
                handleSelectChange(message.value);
                break;
        }
    });

    // Update webview content
    function updateWebview() {
        panel.webview.html = getWebviewContent(panel.webview, formState);
    }

    // Set initial content
    updateWebview();

    return panel;
}

/**
 * Generate the webview HTML content
 */
function getWebviewContent(webview: vscode.Webview, formData: any): string {
    return /*html*/`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Form Example</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
        }
        input, select {
          width: 100%;
          padding: 8px;
          box-sizing: border-box;
        }
        button {
          background-color: #007acc;
          color: white;
          border: none;
          padding: 10px 15px;
          cursor: pointer;
        }
        .checkbox-group {
          display: flex;
          align-items: center;
        }
        .checkbox-group input {
          width: auto;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
      <h1>Interactive Form</h1>
      
      <form id="form">
        <div class="form-group">
          <label for="username">Username:</label>
          <input 
            type="text" 
            id="username" 
            value="${formData.username}"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password:</label>
          <input 
            type="password" 
            id="password" 
            value="${formData.password}"
          />
        </div>
        
        <div class="form-group checkbox-group">
          <input 
            type="checkbox" 
            id="rememberMe" 
            ${formData.rememberMe ? 'checked' : ''}
          />
          <label for="rememberMe">Remember me</label>
        </div>
        
        <div class="form-group">
          <label for="options">Select an option:</label>
          <select id="options">
            <option value="option1" ${formData.selectedOption === 'option1' ? 'selected' : ''}>Option 1</option>
            <option value="option2" ${formData.selectedOption === 'option2' ? 'selected' : ''}>Option 2</option>
            <option value="option3" ${formData.selectedOption === 'option3' ? 'selected' : ''}>Option 3</option>
          </select>
        </div>
        
        <button type="submit">Submit</button>
      </form>
      
      <script>
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('form');
        
        // Update username field
        document.getElementById('username').addEventListener('input', (e) => {
          vscode.postMessage({
            type: 'text',
            field: 'username',
            value: e.target.value
          });
        });
        
        // Update password field
        document.getElementById('password').addEventListener('input', (e) => {
          vscode.postMessage({
            type: 'text',
            field: 'password',
            value: e.target.value
          });
        });
        
        // Update checkbox state
        document.getElementById('rememberMe').addEventListener('change', (e) => {
          vscode.postMessage({
            type: 'checkbox',
            field: 'rememberMe',
            checked: e.target.checked
          });
        });
        
        // Update select field
        document.getElementById('options').addEventListener('change', (e) => {
          vscode.postMessage({
            type: 'select',
            value: e.target.value
          });
        });
        
        // Form submission
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          vscode.postMessage({
            command: 'submitForm',
            type: 'form'
          });
        });
      </script>
    </body>
    </html>
  `;
} 