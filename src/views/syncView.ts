import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Manages the webview for synchronization operations
 */
export class SyncView {
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  /**
   * Creates a new SyncView instance
   * @param extensionUri The URI of the extension
   */
  constructor(private readonly extensionUri: vscode.Uri) {
    this._panel = vscode.window.createWebviewPanel(
      'syncView',
      'Sync Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media')
        ],
        retainContextWhenHidden: true
      }
    );

    // Set webview content
    this._panel.webview.html = this._getWebviewContent();

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => this._handleMessage(message),
      null,
      this._disposables
    );

    // Clean up resources when panel is closed
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );
  }

  /**
   * Handles messages received from the webview
   * @param message The message received from the webview
   */
  private _handleMessage(message: any) {
    switch (message.command) {
      case 'sync':
        vscode.window.showInformationMessage('Syncing settings...');
        // TODO: Implement sync logic
        break;
      case 'export':
        vscode.window.showInformationMessage('Exporting settings...');
        // TODO: Implement export logic
        break;
      case 'import':
        vscode.window.showInformationMessage('Importing settings...');
        // TODO: Implement import logic
        break;
    }
  }

  /**
   * Generates the HTML content for the webview
   * @returns The HTML content
   */
  private _getWebviewContent(): string {
    const styleUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}">
      <title>Sync Settings</title>
    </head>
    <body>
      <div class="container">
        <h1>Synchronization Settings</h1>
        
        <div class="card">
          <h2>Sync Options</h2>
          <button id="syncBtn" class="btn primary">Sync Now</button>
          <button id="exportBtn" class="btn">Export Settings</button>
          <button id="importBtn" class="btn">Import Settings</button>
        </div>
        
        <div class="card">
          <h2>Sync Status</h2>
          <div id="syncStatus">Not synced yet</div>
        </div>
      </div>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('syncBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'sync' });
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'export' });
        });
        
        document.getElementById('importBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'import' });
        });
      </script>
    </body>
    </html>`;
  }

  /**
   * Updates the webview content
   * @param data The data to update the view with
   */
  public update(data: any) {
    this._panel.webview.postMessage({ type: 'update', data });
  }

  /**
   * Disposes of the view and its resources
   */
  public dispose() {
    this._panel.dispose();
    
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
