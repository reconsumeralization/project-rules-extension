import * as vscode from 'vscode';

/**
 * Mock Server Service Implementation
 * This service provides a mock implementation of the ServerService API
 * for testing AI service integration without an actual backend.
 */
class MockServerService {
  /**
   * Mock implementation of callAIService
   */
  async callAIService<T = any>(request: { action: string; data: any }): Promise<{ success: boolean; data?: T; error?: string }> {
    console.log(`MockServerService.callAIService called with action: ${request.action}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Based on the action, return mock responses
    switch (request.action) {
      case 'generateRuleSuggestion':
        return this.mockGenerateRuleSuggestion(request.data);
      case 'suggestNotepadImprovements':
        return this.mockSuggestNotepadImprovements(request.data);
      case 'generateNotepadContent':
        return this.mockGenerateNotepadContent(request.data);
      case 'summarizeFileContent':
        return this.mockSummarizeFileContent(request.data);
      case 'generateNotepadTemplate':
        return this.mockGenerateNotepadTemplate(request.data);
      default:
        return {
          success: false,
          error: `Unknown action: ${request.action}`
        };
    }
  }
  
  /**
   * Mock implementation for generating rule suggestions
   */
  private mockGenerateRuleSuggestion(data: any): { success: boolean; data?: any; error?: string } {
    const { filename, fileContent } = data;
    
    // Check if we have valid input
    if (!filename || !fileContent) {
      return {
        success: false,
        error: 'Missing filename or fileContent in request'
      };
    }
    
    // Generate a mock rule suggestion based on the file extension
    const fileExt = filename.split('.').pop()?.toLowerCase();
    let ruleSuggestion = '';
    
    if (fileExt === 'ts' || fileExt === 'tsx') {
      ruleSuggestion = `# TypeScript Naming Convention\n\n## Description\nUse camelCase for variables and functions, PascalCase for classes and interfaces.\n\n## Applies to\n*.ts, *.tsx\n\n## Examples\n\n### Good\n\`\`\`typescript\nconst userName = 'John';\nfunction calculateTotal() { }\nclass UserProfile { }\ninterface ApiResponse { }\n\`\`\`\n\n### Bad\n\`\`\`typescript\nconst user_name = 'John';\nfunction calculate_total() { }\nclass userProfile { }\ninterface api_response { }\n\`\`\``;
    } else if (fileExt === 'js' || fileExt === 'jsx') {
      ruleSuggestion = `# JavaScript Naming Convention\n\n## Description\nUse camelCase for variables and functions, PascalCase for classes.\n\n## Applies to\n*.js, *.jsx\n\n## Examples\n\n### Good\n\`\`\`javascript\nconst userName = 'John';\nfunction calculateTotal() { }\nclass UserProfile { }\n\`\`\`\n\n### Bad\n\`\`\`javascript\nconst user_name = 'John';\nfunction calculate_total() { }\nclass userProfile { }\n\`\`\``;
    } else if (fileExt === 'cs') {
      ruleSuggestion = `# C# Naming Convention\n\n## Description\nUse PascalCase for public members and camelCase for private fields.\n\n## Applies to\n*.cs\n\n## Examples\n\n### Good\n\`\`\`csharp\npublic class User {\n    private string userName;\n    public string GetUserName() { }\n}\n\`\`\`\n\n### Bad\n\`\`\`csharp\npublic class user {\n    private string UserName;\n    public string getUserName() { }\n}\n\`\`\``;
    } else {
      ruleSuggestion = `# General Coding Standard\n\n## Description\nConsistent indentation and spacing improves code readability.\n\n## Applies to\n*.*\n\n## Examples\n\n### Good\n\`\`\`\nfunction example() {\n    const x = 1;\n    if (x > 0) {\n        return true;\n    }\n}\n\`\`\`\n\n### Bad\n\`\`\`\nfunction example() {\nconst x = 1;\nif(x>0){\nreturn true;\n}\n}\n\`\`\``;
    }
    
    return {
      success: true,
      data: {
        suggestion: ruleSuggestion
      }
    };
  }
  
  /**
   * Mock implementation for suggesting notepad improvements
   */
  private mockSuggestNotepadImprovements(data: any): { success: boolean; data?: any; error?: string } {
    return {
      success: true,
      data: {
        suggestions: [
          {
            title: 'Add code examples',
            content: 'Consider adding code examples to illustrate your points.',
            explanation: 'Examples help readers better understand abstract concepts.'
          },
          {
            title: 'Add references section',
            content: 'Add a "References" section at the end with links to relevant documentation.',
            explanation: 'External references provide additional context and learning paths.'
          }
        ]
      }
    };
  }
  
  /**
   * Mock implementation for generating notepad content
   */
  private mockGenerateNotepadContent(data: any): { success: boolean; data?: any; error?: string } {
    const { prompt } = data;
    
    return {
      success: true,
      data: {
        content: `# ${prompt}\n\n## Overview\nThis is a generated notepad based on your prompt.\n\n## Key Points\n- First key point about ${prompt}\n- Second key point about ${prompt}\n- Third key point about ${prompt}\n\n## Examples\n\`\`\`\nExample code or text related to ${prompt}\n\`\`\`\n\n## Further Reading\n- [Link to resource 1](#)\n- [Link to resource 2](#)`
      }
    };
  }
  
  /**
   * Mock implementation for summarizing file content
   */
  private mockSummarizeFileContent(data: any): { success: boolean; data?: any; error?: string } {
    const { content } = data;
    
    // Simple mocked summary
    const summary = `This file contains approximately ${content.length} characters and appears to be code or text content.`;
    
    return {
      success: true,
      data: {
        summary
      }
    };
  }
  
  /**
   * Mock implementation for generating notepad templates
   */
  private mockGenerateNotepadTemplate(data: any): { success: boolean; data?: any; error?: string } {
    const { prompt } = data;
    
    return {
      success: true,
      data: {
        title: `Template: ${prompt}`,
        content: `# ${prompt} Template\n\n## Purpose\nThis template is designed for ${prompt.toLowerCase()} documentation.\n\n## Structure\n- Section 1: Overview\n- Section 2: Details\n- Section 3: Examples\n\n## Usage Guidelines\nReplace each section with appropriate content while maintaining the overall structure.`,
        tags: [prompt.toLowerCase(), 'template']
      }
    };
  }
}

// Service instances
let mockServerService: MockServerService;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating Project Rules Test Extension...');
  
  try {
    // Initialize the mock server service
    mockServerService = new MockServerService();
    console.log('Mock services initialized.');
    
    // Register command to demonstrate AI integration
    context.subscriptions.push(
      vscode.commands.registerCommand('projectRules.testAiIntegration', demonstrateAiServiceIntegration)
    );
    
    // Export the service instances for use by other modules
    return {
      getServerService: () => mockServerService
    };
    
    console.log('Project Rules Test Extension activated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in activate:', error);
    vscode.window.showErrorMessage(`Project Rules Test Error: ${message}`);
  }
}

export function deactivate() {
  console.log('Deactivating Project Rules Test Extension...');
}

/**
 * Demonstrates the AI service integration by generating a rule improvement suggestion
 */
async function demonstrateAiServiceIntegration() {
  try {
    // Get the active text editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Please open a file to generate a rule suggestion.');
      return;
    }

    // Get the active file content
    const document = editor.document;
    const text = document.getText();
    const fileName = document.fileName.split('/').pop() || document.fileName.split('\\').pop() || 'file.txt';

    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing file for rule suggestions...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 20, message: 'Contacting AI service...' });

        progress.report({ increment: 40, message: 'Generating suggestions...' });

        // Call the AI service
        const response = await mockServerService.callAIService({
          action: 'generateRuleSuggestion',
          data: {
            filename: fileName,
            fileContent: text,
            prompt: 'Analyze this file and suggest a project rule that could help maintain code quality or standards.'
          }
        });

        progress.report({ increment: 40, message: 'Processing response...' });

        if (!response.success) {
          throw new Error(`AI service error: ${response.error}`);
        }

        // Get the suggestion
        const suggestion = response.data?.suggestion || 'No suggestion available';
        
        // Show the result in a webview
        const panel = vscode.window.createWebviewPanel(
          'ruleAiSuggestion',
          'AI Rule Suggestion',
          vscode.ViewColumn.One,
          {
            enableScripts: true
          }
        );

        panel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Rule Suggestion</title>
            <style>
              body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
              }
              h1 {
                color: var(--vscode-editor-foreground);
              }
              pre {
                background-color: var(--vscode-editor-background);
                padding: 10px;
                border-radius: 5px;
                overflow: auto;
              }
              .suggestion {
                background-color: var(--vscode-editor-background);
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
                white-space: pre-wrap;
              }
              button {
                margin-top: 20px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 2px;
                cursor: pointer;
              }
              button:hover {
                background-color: var(--vscode-button-hoverBackground);
              }
            </style>
          </head>
          <body>
            <h1>AI Rule Suggestion for ${fileName}</h1>
            <p>The AI has analyzed your file and suggested the following rule:</p>
            
            <div class="suggestion">
              ${suggestion}
            </div>
            
            <button id="createRuleBtn">Create Rule from Suggestion</button>

            <script>
              const vscode = acquireVsCodeApi();
              document.getElementById('createRuleBtn').addEventListener('click', () => {
                vscode.postMessage({
                  command: 'createRule',
                  suggestion: ${JSON.stringify(suggestion)}
                });
              });
            </script>
          </body>
          </html>
        `;

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
          async (message) => {
            if (message.command === 'createRule') {
              // Implement rule creation logic here
              vscode.window.showInformationMessage('Rule creation from AI suggestion is not yet implemented.');
            }
          },
          undefined,
          []
        );
      }
    );
  } catch (error) {
    console.error('Error in demonstrateAiServiceIntegration:', error);
    vscode.window.showErrorMessage(`Failed to get AI rule suggestion: ${error instanceof Error ? error.message : String(error)}`);
  }
} 