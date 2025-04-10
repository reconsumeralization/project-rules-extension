import * as vscode from 'vscode';
import { McpAgentService } from '../services/mcpAgentService';
import { ServerService } from '../services/serverService'; // Import the class
import { McpAgentsViewProvider } from '../views/mcpAgentsView';

// --- Module State ---
let agentService: McpAgentService | null = null;
let serverServiceInstance: ServerService | null = null; // Store the instance
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * Initializes the MCP Server Controller
 */
export function initializeMcpServerController(
  context: vscode.ExtensionContext,
  _serverService: ServerService, // Expect the instance
  _agentService: McpAgentService,
): void {
  extensionContext = context;
  serverServiceInstance = _serverService; // Store the provided instance
  agentService = _agentService;
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ProjectRules.connectMcpServer', connectMcpServer),
    vscode.commands.registerCommand('ProjectRules.disconnectMcpServer', disconnectMcpServer),
    vscode.commands.registerCommand('ProjectRules.showServerStatus', showServerStatus),
    vscode.commands.registerCommand('ProjectRules.configureMcpServer', configureMcpServer)
  );
  
  // Listen to server service status changes
  // TODO: Add listener if ServerService implements an onStatusChanged event
  // serverServiceInstance.onStatusChanged(showServerStatus);
}

/**
 * Connects to the MCP Server using the service instance
 */
async function connectMcpServer(): Promise<void> {
  if (!serverServiceInstance) {
    vscode.window.showErrorMessage('MCP Server Service not initialized.');
    return;
  }
  
  // URL is handled internally by the service now based on config

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Connecting to MCP Server...',
        cancellable: false // Add cancellation support later if needed
      },
      async (progress) => {
        progress.report({ message: `Connecting...` });
        // Assume ServerService has a connect method that handles URL internally
        // We might need to add a connect method to ServerService if it doesn't exist
        // For now, let's assume calling a method like fetchRules implies connection attempt
        await serverServiceInstance!.fetchRules(); // Or a dedicated connect/health check method
      }
    );
    const serverUrl = serverServiceInstance.getServerUrl(); // Assuming service has this method
    vscode.window.showInformationMessage(`Successfully connected to MCP Server at ${serverUrl}`);
  } catch (error) {
    console.error('MCP Server connection error:', error);
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to connect to MCP Server: ${message}`);
  } finally {
    showServerStatus(); // Update status based on service state
  }
}

/**
 * Disconnects from the MCP Server using the service instance
 */
async function disconnectMcpServer(): Promise<void> {
  if (!serverServiceInstance) {
    vscode.window.showErrorMessage('MCP Server Service not initialized.');
    return;
  }
  
  try {
    // Assume ServerService has a disconnect method
    await serverServiceInstance.disconnect(); // Need to implement this in ServerService
    vscode.window.showInformationMessage('Disconnected from MCP Server.');
  } catch (error) {
    console.error('MCP Server disconnection error:', error);
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to disconnect from MCP Server: ${message}`);
  } finally {
    showServerStatus();
  }
}

/**
 * Shows the current status of the MCP Server connection from the service
 */
async function showServerStatus(): Promise<void> {
  if (!serverServiceInstance) {
    vscode.window.showErrorMessage('MCP Server Service not initialized.');
    // Potentially set status bar to indicate uninitialized state
    vscode.window.setStatusBarMessage(`MCP Server: Uninitialized`, 5000);
    return;
  }
  
  // Assume ServerService has methods for status and URL
  const status = serverServiceInstance.getConnectionStatus(); // Need to implement this
  const serverUrl = serverServiceInstance.getServerUrl(); // Need to implement this
  
  let message = `MCP Server Status: ${status}`;
  if (status === 'connected' && serverUrl) {
    message += ` (${serverUrl})`;
  } else if (status === 'error' && serverUrl) {
    message += ` (Error connecting to ${serverUrl})`;
  }
  
  console.log(message); // Log status for debugging
  // Update status bar - make this more permanent later
  vscode.window.setStatusBarMessage(`MCP Server: ${status}`, 5000);
}

/**
 * Opens settings to configure the MCP Server URL and Auth Token
 */
async function configureMcpServer(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', 'ProjectRules.mcpServerUrl');
}

// Example function (can be removed if not needed)
async function getAgentCount(): Promise<number> {
  if (!agentService) {
    return 0;
  }
  // Await the promise returned by getAgents
  const agents = await agentService.getAgents(); 
  return agents.length;
}
