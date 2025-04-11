import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from '../utils';
import { MCPProtocolService } from '../services/mcpProtocolService';

/**
 * Manages the MCP Protocol view webview panel
 * 
 * This class handles the display and interaction with the MCP Protocol editor UI,
 * including protocol listing, editing, creation, validation, and updates.
 * It maintains a singleton instance via the currentPanel static property.
 */
export class MCPView {
  /**
   * Tracks the currently active panel to ensure only one instance exists at a time
   */
  public static currentPanel: MCPView | undefined;
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _protocolService: MCPProtocolService;

  /**
   * Creates a new MCPView panel or shows an existing one
   * 
   * @param extensionUri - The URI of the extension for resource loading
   * @param protocolService - The service that handles protocol operations
   */
  public static createOrShow(extensionUri: vscode.Uri, protocolService: MCPProtocolService) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (MCPView.currentPanel) {
      MCPView.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'mcpView',
      'MCP Protocol Editor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist')
        ],
        retainContextWhenHidden: true
      }
    );

    MCPView.currentPanel = new MCPView(panel, extensionUri, protocolService);
  }

  /**
   * Private constructor to enforce singleton pattern through createOrShow
   * 
   * @param panel - The webview panel to display the UI
   * @param extensionUri - The URI of the extension for resource loading
   * @param protocolService - The service that handles protocol operations
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, protocolService: MCPProtocolService) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._protocolService = protocolService;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.command) {
            case 'getProtocols':
              await this.handleGetProtocols();
              break;
              
            case 'getProtocol':
              await this.handleGetProtocol(message.id);
              break;
              
            case 'createProtocol':
              await this.handleCreateProtocol(message.protocol);
              break;
              
            case 'updateProtocol':
              await this.handleUpdateProtocol(message.protocol);
              break;
              
            case 'validateProtocol':
              await this.handleValidateProtocol(message.protocol);
              break;
              
            default:
              console.warn(`Unhandled command in MCPView: ${message.command}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error in MCP Protocol View: ${errorMessage}`);
          console.error(`MCPView error handling message ${message.command}:`, error);
        }
      },
      null,
      this._disposables
    );
  }
  
  /**
   * Handles the getProtocols request from the webview
   * Fetches and returns the list of available protocols
   */
  private async handleGetProtocols(): Promise<void> {
    const protocols = await this._protocolService.getProtocols();
    this._panel.webview.postMessage({
      command: 'protocolList',
      protocols: protocols.map(p => ({ id: p.id, name: p.name }))
    });
  }
  
  /**
   * Handles the getProtocol request from the webview
   * Fetches and returns a specific protocol by ID
   * 
   * @param id - The ID of the protocol to retrieve
   */
  private async handleGetProtocol(id?: string): Promise<void> {
    if (!id) {
      throw new Error('Protocol ID is required');
    }
    
    const protocol = await this._protocolService.getProtocol(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    this._panel.webview.postMessage({
      command: 'setProtocol',
      protocol
    });
  }
  
  /**
   * Handles the createProtocol request from the webview
   * Creates a new protocol with the provided data
   * 
   * @param protocolData - The protocol data to create
   */
  private async handleCreateProtocol(protocolData: any): Promise<void> {
    if (!protocolData) {
      throw new Error('Protocol data is required');
    }
    
    const newProtocol = await this._protocolService.createProtocol(protocolData);
    this._panel.webview.postMessage({
      command: 'setProtocol',
      protocol: newProtocol
    });
    
    vscode.window.showInformationMessage(`Protocol "${newProtocol.name}" created successfully.`);
  }
  
  /**
   * Handles the updateProtocol request from the webview
   * Updates an existing protocol with the provided data
   * 
   * @param protocolData - The protocol data to update, must include an ID
   */
  private async handleUpdateProtocol(protocolData: any): Promise<void> {
    if (!protocolData || !protocolData.id) {
      throw new Error('Protocol data with ID is required');
    }
    
    const updatedProtocol = await this._protocolService.updateProtocol(
      protocolData.id,
      protocolData
    );
    
    this._panel.webview.postMessage({
      command: 'setProtocol',
      protocol: updatedProtocol
    });
    
    vscode.window.showInformationMessage(`Protocol "${updatedProtocol.name}" updated successfully.`);
  }
  
  /**
   * Handles the validateProtocol request from the webview
   * Validates the provided protocol data and returns the validation results
   * 
   * @param protocolData - The protocol data to validate
   */
  private async handleValidateProtocol(protocolData: any): Promise<void> {
    if (!protocolData) {
      throw new Error('Protocol data is required');
    }
    
    const validationResult = this._protocolService.validateProtocol(protocolData);
    this._panel.webview.postMessage({
      command: 'validationResult',
      result: validationResult
    });
  }

  /**
   * Disposes of the panel and releases all resources
   * Called when the webview panel is closed
   */
  public dispose() {
    MCPView.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Updates the content of the webview panel
   * Called when the panel becomes visible or is first created
   */
  private _update() {
    const webview = this._panel.webview;
    this._panel.title = "MCP Protocol Editor";
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  /**
   * Generates the HTML content for the webview panel
   * Sets up the necessary script and style resources with proper CSP
   * 
   * @param webview - The webview to generate HTML for
   * @returns The HTML content as a string
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get paths to the bundled React app
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'mcpProtocolView-ui.js')
    );
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'mcpProtocolView-ui.css')
    );

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>MCP Protocol Editor</title>
    </head>
    <body>
      <div id="root"></div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}
