import * as vscode from 'vscode'
import * as path from 'path'
import { McpAgentService, McpAgent } from '../services/mcpAgentService'
import { getNonce } from '../utils'

/**
 * Provider for the MCP Agents WebView
 */
export class McpAgentsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ProjectRules.mcpAgentsView'
  
  private _view?: vscode.WebviewView
  private _agentService: McpAgentService
  
  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    agentService: McpAgentService
  ) {
    this._agentService = agentService
    
    // Listen for agent changes to update the webview
    this._agentService.onAgentsChanged(() => {
      this.refresh()
    })
  }
  
  /**
   * Called when the view is first created
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView
    
    // Set webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionContext.extensionUri, 'media')
      ]
    }
    
    // Set the HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'getAgents':
          this._sendAgentList()
          break
        case 'getAgentDetails':
          this._sendAgentDetails(message.agentId)
          break
        case 'createAgent':
          await this._showCreateAgentForm()
          break
        case 'editAgent':
          await this._showEditAgentForm(message.agentId)
          break
        case 'deleteAgent':
          await this._deleteAgent(message.agentId)
          break
        case 'toggleAgentStatus':
          await this._toggleAgentStatus(message.agentId, message.currentStatus)
          break
        case 'refreshAgentStats':
          if (message.agentId) {
            console.log(`McpAgentsViewProvider: Received refreshAgentStats for ${message.agentId}`)
            this._agentService.refreshAgentStats(message.agentId).catch(error => {
              console.error(`Error refreshing agent stats for ${message.agentId}:`, error)
              if(this._view) {
                this._view.webview.postMessage({ 
                  command: 'notification', 
                  text: `Error refreshing stats: ${error.message || 'Unknown error'}`,
                  type: 'error' 
                })
              }
            })
          }
          break
        case 'executeCommand':
          if (message.commandId && typeof message.commandId === 'string') {
            console.log(`McpAgentsViewProvider: Executing command: ${message.commandId}`);
            vscode.commands.executeCommand(message.commandId)
              .then(undefined, (err) => { // Handle potential errors from command execution
                console.error(`McpAgentsViewProvider: Error executing command ${message.commandId}:`, err);
                if(this._view) {
                  this._view.webview.postMessage({ 
                    command: 'notification', 
                    text: `Error executing command: ${err.message || 'Unknown error'}`,
                    type: 'error' 
                  });
                }
              });
          } else {
            console.error('McpAgentsViewProvider: Invalid executeCommand message received', message);
          }
          break
      }
    })
    
    // Initialize default agents if needed and send the list
    this._agentService.initializeDefaultAgents().then(() => {
      this._sendAgentList()
    })
  }
  
  /**
   * Refresh the webview content
   */
  public refresh(): void {
    if (this._view) {
      this._sendAgentList()
    }
  }
  
  /**
   * Send the list of agents to the webview
   */
  private _sendAgentList(): void {
    if (!this._view) return
    
    const agents = this._agentService.getAgents()
    this._view.webview.postMessage({
      command: 'agentList',
      data: agents
    })
  }
  
  /**
   * Send details of a specific agent to the webview
   */
  private _sendAgentDetails(agentId: string): void {
    if (!this._view) return
    
    const agent = this._agentService.getAgentById(agentId)
    if (agent) {
      this._view.webview.postMessage({
        command: 'agentDetails',
        data: agent
      })
    } else {
      this._view.webview.postMessage({
        command: 'notification',
        text: `Agent with ID ${agentId} not found`,
        type: 'error'
      })
    }
  }
  
  /**
   * Show form to create a new agent
   */
  private async _showCreateAgentForm(): Promise<void> {
    // In a real implementation, this would show an input form
    // For simplicity, we'll use a quick pick with predefined agent types
    const agentType = await vscode.window.showQuickPick(
      [
        'Validation',
        'Code Generation',
        'Optimization',
        'Observability',
        'Intelligence',
        'Custom'
      ],
      {
        placeHolder: 'Select agent type'
      }
    )
    
    if (!agentType) return
    
    const agentName = await vscode.window.showInputBox({
      prompt: 'Enter agent name',
      placeHolder: 'e.g., Custom Validation Agent'
    })
    
    if (!agentName) return
    
    const agentDescription = await vscode.window.showInputBox({
      prompt: 'Enter agent description',
      placeHolder: 'e.g., Validates MCP against custom rules'
    })
    
    if (!agentDescription) return
    
    // Create the agent
    const newAgent = await this._agentService.createAgent({
      name: agentName,
      type: agentType,
      description: agentDescription || `A custom ${agentType.toLowerCase()} agent`,
      status: 'pending',
      capabilities: ['Custom capability 1', 'Custom capability 2'],
      configuration: {
        customSetting: 'value'
      }
    })
    
    if (this._view) {
      this._view.webview.postMessage({
        command: 'notification',
        text: `Created agent: ${newAgent.name}`,
        type: 'success'
      })
    }
  }
  
  /**
   * Show form to edit an existing agent
   */
  private async _showEditAgentForm(agentId: string): Promise<void> {
    const agent = this._agentService.getAgentById(agentId)
    if (!agent) {
      if (this._view) {
        this._view.webview.postMessage({
          command: 'notification',
          text: `Agent with ID ${agentId} not found`,
          type: 'error'
        })
      }
      return
    }
    
    // In a real implementation, this would show a form with all agent properties
    // For simplicity, we'll just update the description
    const newDescription = await vscode.window.showInputBox({
      prompt: 'Update agent description',
      value: agent.description
    })
    
    if (newDescription === undefined) return
    
    const updatedAgent = await this._agentService.updateAgent(agentId, {
      description: newDescription
    })
    
    if (updatedAgent && this._view) {
      this._sendAgentDetails(agentId)
      this._view.webview.postMessage({
        command: 'notification',
        text: `Updated agent: ${updatedAgent.name}`,
        type: 'success'
      })
    }
  }
  
  /**
   * Delete an agent
   */
  private async _deleteAgent(agentId: string): Promise<void> {
    const agent = this._agentService.getAgentById(agentId)
    if (!agent) {
      if (this._view) {
        this._view.webview.postMessage({
          command: 'notification',
          text: `Agent with ID ${agentId} not found`,
          type: 'error'
        })
      }
      return
    }
    
    const deleted = await this._agentService.deleteAgent(agentId)
    
    if (this._view) {
      if (deleted) {
        this._view.webview.postMessage({
          command: 'notification',
          text: `Deleted agent: ${agent.name}`,
          type: 'success'
        })
      } else {
        this._view.webview.postMessage({
          command: 'notification',
          text: `Failed to delete agent: ${agent.name}`,
          type: 'error'
        })
      }
    }
  }
  
  /**
   * Toggle an agent's active status
   */
  private async _toggleAgentStatus(agentId: string, currentStatus: string): Promise<void> {
    const agent = await this._agentService.toggleAgentStatus(agentId)
    
    if (agent && this._view) {
      this._sendAgentDetails(agentId)
      this._view.webview.postMessage({
        command: 'notification',
        text: `Agent ${agent.name} is now ${agent.status}`,
        type: 'success'
      })
    }
  }
  
  /**
   * Generate the HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to the script file and convert to a URI
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'media', 'MCPServerAgents.js')
    )
    
    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce()
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};">
        <title>MCP Server Agents</title>
        <style>
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                line-height: 1.6;
                color: var(--vscode-foreground);
                padding: 1rem;
            }
            h1, h2, h3 {
                font-weight: 600;
                margin-top: 1.5rem;
                margin-bottom: 0.5rem;
            }
            .agent-card {
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
                padding: 1rem;
                margin-bottom: 1rem;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .agent-card:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .agent-card.selected {
                border-color: var(--vscode-focusBorder);
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }
            .agent-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }
            .agent-type {
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 0.2rem 0.5rem;
                border-radius: 3px;
                font-size: 0.8rem;
            }
            .agent-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 0.5rem;
            }
            .agent-status {
                padding: 0.2rem 0.5rem;
                border-radius: 3px;
                font-size: 0.8rem;
            }
            .status-active {
                background-color: var(--vscode-testing-iconPassed);
                color: white;
            }
            .status-inactive {
                background-color: var(--vscode-disabledForeground);
                color: white;
            }
            .status-pending {
                background-color: var(--vscode-testing-iconQueued);
                color: white;
            }
            button {
                padding: 0.5rem 0.75rem;
                border: none;
                border-radius: 2px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                cursor: pointer;
                font-size: 0.9rem;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            select, input {
                padding: 0.3rem 0.5rem;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 2px;
            }
            .agent-details-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }
            .info-row {
                margin-bottom: 0.5rem;
            }
            .label {
                font-weight: 600;
                margin-right: 0.5rem;
            }
            pre {
                background-color: var(--vscode-textCodeBlock-background);
                padding: 0.5rem;
                border-radius: 3px;
                overflow-x: auto;
            }
            .loading, .no-results {
                padding: 1rem;
                text-align: center;
                font-style: italic;
                color: var(--vscode-disabledForeground);
            }
        </style>
    </head>
    <body>
        <h1>MCP Server Agents</h1>
        
        <div class="controls">
            <div>
                <select id="filter-type">
                    <option value="all">All Types</option>
                    <option value="Validation">Validation</option>
                    <option value="Code Generation">Code Generation</option>
                    <option value="Optimization">Optimization</option>
                    <option value="Observability">Observability</option>
                    <option value="Intelligence">Intelligence</option>
                </select>
                <select id="filter-status">
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                </select>
            </div>
            <div>
                <input type="text" id="search-agents" placeholder="Search agents...">
            </div>
            <div>
                <button id="create-agent">Create Agent</button>
                <button id="refresh-agents">Refresh</button>
                <button id="refresh-all-stats">Refresh All Stats</button>
            </div>
        </div>
        
        <div id="agent-list">
            <div class="loading">Loading agents...</div>
        </div>
        
        <div id="agent-details"></div>
        
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`
  }
  
  /**
   * Generate a nonce string
   */
  private _getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }
} 