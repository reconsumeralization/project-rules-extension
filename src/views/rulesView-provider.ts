import * as vscode from 'vscode'
import * as path from 'path'
import { getNonce } from '../utils'

export class RulesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ProjectRules.rulesView'
  
  private _view?: vscode.WebviewView
  
  constructor(
    private readonly _extensionContext: vscode.ExtensionContext
  ) {}
  
  /**
   * Called when the view becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView
    
    // Set up webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionContext.extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionContext.extensionUri, 'dist', 'webview')
      ]
    }
    
    // Set the HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'getRules':
          // Example: Get rules and send back to webview
          this._sendRules()
          break
        case 'createRule':
          // Example: Create a new rule
          vscode.window.showInformationMessage(`Creating rule: ${message.rule.title}`)
          break
        case 'deleteRule':
          // Example: Delete a rule
          vscode.window.showInformationMessage(`Deleting rule: ${message.ruleId}`)
          break
        case 'openRule':
          // Example: Open a rule in the editor
          vscode.window.showInformationMessage(`Opening rule: ${message.ruleId}`)
          break
      }
    })
  }
  
  /**
   * Returns the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs of resources to include in the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'dist', 'webview', 'rulesView.js')
    )
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'media', 'rulesView.css')
    )
    
    // Create a nonce to only allow specific scripts to be run
    const nonce = getNonce()
    
    // Build the HTML content
    return /*html*/`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <title>Rules View</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `
  }
  
  /**
   * Send rules data to the webview
   */
  private _sendRules(): void {
    if (!this._view) return
    
    // Example: Send mock rules data
    const mockRules = [
      {
        id: '1',
        title: 'Naming Convention',
        filename: 'naming-convention.mdc',
        content: '# Naming Convention\n\nUse camelCase for variables, PascalCase for classes.',
        syncStatus: 'synced',
        appliesTo: 'JavaScript, TypeScript'
      },
      {
        id: '2',
        title: 'Code Formatting',
        filename: 'code-formatting.mdc',
        content: '# Code Formatting\n\nUse 2 spaces for indentation.',
        syncStatus: 'local-only',
        appliesTo: 'All code'
      }
    ]
    
    this._view.webview.postMessage({
      type: 'updateRules',
      rules: mockRules
    })
  }
  
  /**
   * Refresh the webview
   */
  public refresh(): void {
    if (this._view) {
      this._sendRules()
    }
  }
  
  /**
   * Show the "Create Rule" dialog in the webview
   */
  public showCreateDialog(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'showCreateDialog'
      })
    }
  }
} 