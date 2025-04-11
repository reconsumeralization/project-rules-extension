import * as React from 'react';
import { useState, useCallback } from 'react';
import * as vscode from 'vscode';
import { 
  NormalizedEvent,
  NormalizedChangeEvent,
  fromReactEvent, 
  fromVSCodeEvent,
  createChangeHandler,
  createVSCodeChangeHandler,
  createSubmitHandler,
  createEnhancedHandler,
  handleRadixChange,
  adaptHandler,
  normalizeChangeEvent
} from '../utils/eventHandlers';

interface FormData {
    name: string;
    email: string;
    agreeToTerms: boolean;
}

/**
 * Example 1: Basic React Component with Enhanced Handlers
 * Shows how to use the enhanced handlers in a form component
 */
export function EnhancedForm() {
    // Form state
    const [formData, setFormData] = useState<FormData>({
        name: '',
        email: '',
        agreeToTerms: false
    });

    // Create handlers for each form field
    const handleNameChange = createChangeHandler<string>(value => {
        setFormData(prev => ({ ...prev, name: value }));
    });

    const handleEmailChange = createChangeHandler<string>(value => {
        setFormData(prev => ({ ...prev, email: value }));
    });

    const handleCheckboxChange = createChangeHandler<boolean>(value => {
        setFormData(prev => ({ ...prev, agreeToTerms: value }));
    });

    // Handle form submission
    const handleSubmit = createSubmitHandler(async (data) => {
        // Process form data
        console.log('Submitting form data:', formData);
        
        // In a real app, you would make an API call here
        alert(`Form submitted with: ${JSON.stringify(formData, null, 2)}`);
    });

    return (
        <form onSubmit={handleSubmit} className="enhanced-form">
            <div className="form-group">
                <label htmlFor="name">Name:</label>
                <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={handleNameChange}
                    placeholder="Enter your name"
                    required
                />
            </div>

            <div className="form-group">
                <label htmlFor="email">Email:</label>
                <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleEmailChange}
                    placeholder="Enter your email"
                    required
                />
            </div>

            <div className="form-group checkbox">
                <input
                    id="terms"
                    type="checkbox"
                    checked={formData.agreeToTerms}
                    onChange={handleCheckboxChange}
                />
                <label htmlFor="terms">I agree to the terms and conditions</label>
            </div>

            <button type="submit" disabled={!formData.agreeToTerms}>
                Submit
            </button>

            {/* Example of manually using the handler */}
            <button
                type="button"
                onClick={() => {
                    // You can directly call the handler with any compatible object
                    handleNameChange({ target: { value: 'Auto-filled Name' } });
                    handleEmailChange({ target: { value: 'auto@example.com' } });
                }}
            >
                Auto-fill
            </button>
        </form>
    );
}

/**
 * Example 2: Multi-field Form with a Single Handler
 * Shows how to use one handler for multiple fields
 */
export function MultiFieldForm() {
    const [values, setValues] = useState({
        firstName: '',
        lastName: '',
        phone: ''
    });

    // A single handler for multiple fields
    const handleFieldChange = createChangeHandler<string>(value => {
        // Get field name from the active element
        const target = document.activeElement as HTMLInputElement;
        const fieldName = target?.name || target?.id;
        
        if (fieldName) {
            setValues(prev => ({
                ...prev,
                [fieldName]: value
            }));
        }
    });

    return (
        <form className="multi-field-form">
            <div className="form-group">
                <label htmlFor="firstName">First Name:</label>
                <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={values.firstName}
                    onChange={handleFieldChange}
                />
            </div>

            <div className="form-group">
                <label htmlFor="lastName">Last Name:</label>
                <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={values.lastName}
                    onChange={handleFieldChange}
                />
            </div>

            <div className="form-group">
                <label htmlFor="phone">Phone:</label>
                <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={values.phone}
                    onChange={handleFieldChange}
                />
            </div>

            <pre>
                {JSON.stringify(values, null, 2)}
            </pre>
        </form>
    );
}

/**
 * Example 3: VSCode WebView Integration
 * Shows how to use the handlers with VSCode WebViews
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

    // Create VSCode-specific handlers
    const handleTextInput = createVSCodeChangeHandler<string>(value => {
        // Access the field from the message in the handler call
        let fieldName = '';
        panel.webview.onDidReceiveMessage(message => {
            fieldName = message.field;
        });
        
        if (fieldName) {
            formState = { ...formState, [fieldName]: value };
            updateWebview();
        }
    });

    const handleCheckbox = createVSCodeChangeHandler<boolean>(checked => {
        formState.rememberMe = checked;
        updateWebview();
    });

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(message => {
        if (message.command === 'submit') {
            // Handle form submission
            vscode.window.showInformationMessage(`Form submitted: ${JSON.stringify(formState)}`);
            return;
        }
        
        // Route messages to appropriate handlers
        switch (message.type) {
            case 'text':
                handleTextInput(message.value);
                break;
            case 'checkbox':
                handleCheckbox(message.checked);
                break;
            case 'select':
                formState.selectedOption = message.value;
                updateWebview();
                break;
        }
    });

    // Update webview content
    function updateWebview() {
        panel.webview.html = `
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
                            value="${formState.username}"
                        />
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password:</label>
                        <input 
                            type="password" 
                            id="password" 
                            value="${formState.password}"
                        />
                    </div>
                    
                    <div class="form-group">
                        <input 
                            type="checkbox" 
                            id="rememberMe" 
                            ${formState.rememberMe ? 'checked' : ''}
                        />
                        <label for="rememberMe">Remember me</label>
                    </div>
                    
                    <div class="form-group">
                        <label for="options">Select an option:</label>
                        <select id="options">
                            <option value="option1" ${formState.selectedOption === 'option1' ? 'selected' : ''}>Option 1</option>
                            <option value="option2" ${formState.selectedOption === 'option2' ? 'selected' : ''}>Option 2</option>
                            <option value="option3" ${formState.selectedOption === 'option3' ? 'selected' : ''}>Option 3</option>
                        </select>
                    </div>
                    
                    <button type="submit">Submit</button>
                </form>
                
                <script>
                    const vscode = acquireVsCodeApi();
                    const form = document.getElementById('form');
                    
                    // Handle text inputs
                    document.getElementById('username').addEventListener('input', (e) => {
                        vscode.postMessage({
                            type: 'text',
                            field: 'username',
                            value: e.target.value
                        });
                    });
                    
                    document.getElementById('password').addEventListener('input', (e) => {
                        vscode.postMessage({
                            type: 'text',
                            field: 'password',
                            value: e.target.value
                        });
                    });
                    
                    // Handle checkbox
                    document.getElementById('rememberMe').addEventListener('change', (e) => {
                        vscode.postMessage({
                            type: 'checkbox',
                            checked: e.target.checked
                        });
                    });
                    
                    // Handle select
                    document.getElementById('options').addEventListener('change', (e) => {
                        vscode.postMessage({
                            type: 'select',
                            value: e.target.value
                        });
                    });
                    
                    // Handle form submission
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        vscode.postMessage({
                            command: 'submit'
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }

    // Set initial content
    updateWebview();
    
    return panel;
}

/**
 * Example 4: Advanced usage with the normalized event interface
 */
export function advancedEventHandling(event: any) {
    // Determine event source and normalize
    let normalizedEvent: NormalizedEvent<any>;
    
    if (event.nativeEvent) {
        normalizedEvent = fromReactEvent(event);
    } else {
        normalizedEvent = fromVSCodeEvent(event);
    }
    
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