import * as vscode from 'vscode';
import { McpAgentService } from '../services/mcpAgentService';
import { McpAgentsViewProvider } from '../views/mcpAgentsView';
import { ServerService } from '../services/serverService';

// --- Module State ---
let agentService: McpAgentService | null = null;
let serverService: ServerService | null = null;
let extensionContext: vscode.ExtensionContext | null = null;
let refreshDebounceTimer: NodeJS.Timeout | null = null; // Timer for debouncing
const DEBOUNCE_DELAY = 2000; // 2 seconds delay

/**
 * Initializes the Agent Controller and sets up focus listener
 * @param context Extension context
 * @param _agentService Instance of McpAgentService
 * @param _serverService Instance of ServerService
 */
export function initializeAgentController(
  context: vscode.ExtensionContext,
  _agentService: McpAgentService,
  _serverService: ServerService
): void {
  extensionContext = context;
  agentService = _agentService;
  serverService = _serverService;
  
  // Register commands related to agents
  context.subscriptions.push(
    vscode.commands.registerCommand('ProjectRules.createAgent', createAgent),
    vscode.commands.registerCommand('ProjectRules.deleteAgent', deleteAgent),
    vscode.commands.registerCommand('ProjectRules.toggleAgentStatus', toggleAgentStatus),
    vscode.commands.registerCommand('ProjectRules.refreshAgentStats', refreshAgentStats),
    vscode.commands.registerCommand('ProjectRules.refreshAllAgentStats', refreshAllAgentStats)
  );

  // Listen for window focus changes for auto-refresh
  const focusChangeListener = vscode.window.onDidChangeWindowState(handleWindowStateChange);
  context.subscriptions.push(focusChangeListener);

  // Also listen for ServerService status changes
  const statusChangeListener = serverService.onStatusChanged(handleServerStatusChange);
  context.subscriptions.push(statusChangeListener);

  // Initial check in case the window is already focused when the extension loads
  if (vscode.window.state.focused && serverService.getConnectionStatus() === 'connected') {
    // Trigger initial refresh slightly delayed after activation
    triggerAutoRefresh(true); 
  }
}

/**
 * Handles server connection status changes.
 */
function handleServerStatusChange(status: string) {
    console.log(`AgentController observed server status change: ${status}`);
    // If we just connected and the window is focused, trigger a refresh
    if (status === 'connected' && vscode.window.state.focused) {
        triggerAutoRefresh();
    }
}

/**
 * Handles window state changes to trigger auto-refresh on focus gain.
 */
function handleWindowStateChange(windowState: vscode.WindowState) {
  if (windowState.focused) {
    console.log('Window gained focus, considering auto-refresh...');
    triggerAutoRefresh();
  }
}

/**
 * Triggers the auto-refresh logic with debouncing.
 */
function triggerAutoRefresh(isInitialLoad = false) {
  const config = vscode.workspace.getConfiguration('ProjectRules.mcpAgents');
  const autoRefreshEnabled = config.get<boolean>('autoRefreshOnFocus', true);

  if (!autoRefreshEnabled) {
    // console.log('Auto-refresh on focus is disabled.'); // Reduce noise
    return;
  }

  if (!agentService || !serverService) { // Check both services
    console.warn('Cannot auto-refresh: Service(s) not available.');
    return;
  }
  
  // Use the injected serverService to check status
  if (serverService.getConnectionStatus() !== 'connected') { 
     console.log('Skipping auto-refresh: Not connected to server.');
     return;
  }

  // Clear existing timer if focus changes rapidly
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
  }

  // Set a new timer
  refreshDebounceTimer = setTimeout(async () => {
    console.log('Executing debounced auto-refresh...');
    try {
        // Use the existing batch refresh command logic, but without user prompts
        if (!agentService) throw new Error('Agent Service became unavailable.');
        
        vscode.window.setStatusBarMessage('$(sync~spin) Auto-refreshing agent stats...', 3000);
        const result = await agentService.refreshAllAgentStats();
        vscode.window.setStatusBarMessage(`$(check) Agent stats refreshed (${result.successCount} ok, ${result.errorCount} err).`, 5000);
        console.log(`Auto-refresh complete. Success: ${result.successCount}, Errors: ${result.errorCount}`);

    } catch (error) {
        console.error('Auto-refresh failed:', error);
        vscode.window.setStatusBarMessage('$(error) Failed to auto-refresh agent stats.', 5000);
    }
  }, isInitialLoad ? 500 : DEBOUNCE_DELAY); // Shorter delay on initial load
}

/**
 * Command to create a new agent
 */
async function createAgent(): Promise<void> {
  if (!agentService || !extensionContext) {
    vscode.window.showErrorMessage('Agent Service not initialized.');
    return;
  }
  
  // Use the provider's method if it exists and is accessible
  // Or re-implement the creation logic here using agentService
  const agentType = await vscode.window.showQuickPick(
    ['Validation', 'Code Generation', 'Optimization', 'Observability', 'Intelligence', 'Custom'],
    { placeHolder: 'Select agent type' }
  );
  if (!agentType) return;
  
  const agentName = await vscode.window.showInputBox({ prompt: 'Enter agent name' });
  if (!agentName) return;
  
  const agentDescription = await vscode.window.showInputBox({ prompt: 'Enter agent description' });
  if (!agentDescription) return;

  try {
    const newAgent = await agentService.createAgent({
      name: agentName,
      type: agentType,
      description: agentDescription,
      status: 'pending',
      capabilities: [],
      configuration: {},
    });
    vscode.window.showInformationMessage(`Created agent: ${newAgent.name}`);
    // Refresh view if possible
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to create agent: ${message}`);
  }
}

/**
 * Command to delete an agent
 */
async function deleteAgent(): Promise<void> {
  if (!agentService) return;

  const agents = await agentService.getAgents();
  const agentPicks = agents.map(a => ({ label: a.name, description: a.type, id: a.id }));
  const selectedAgent = await vscode.window.showQuickPick(agentPicks, { placeHolder: 'Select agent to delete' });
  
  if (!selectedAgent) return;

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete agent "${selectedAgent.label}"?`,
    { modal: true }, 'Delete'
  );
  if (confirmation !== 'Delete') return;

  try {
    const deleted = await agentService.deleteAgent(selectedAgent.id);
    if (deleted) {
      vscode.window.showInformationMessage(`Agent "${selectedAgent.label}" deleted.`);
    } else {
      vscode.window.showWarningMessage(`Agent "${selectedAgent.label}" not found or already deleted.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to delete agent: ${message}`);
  }
}

/**
 * Command to toggle agent status (active/inactive)
 */
async function toggleAgentStatus(): Promise<void> {
   if (!agentService) return;

  const agents = await agentService.getAgents();
  const agentPicks = agents.map(a => ({ label: a.name, description: `Status: ${a.status}`, id: a.id }));
  const selectedAgent = await vscode.window.showQuickPick(agentPicks, { placeHolder: 'Select agent to toggle status' });
  
  if (!selectedAgent) return;
  
  try {
      const updatedAgent = await agentService.toggleAgentStatus(selectedAgent.id);
      if (updatedAgent) {
          vscode.window.showInformationMessage(`Agent "${updatedAgent.name}" status set to ${updatedAgent.status}.`);
      } else {
          vscode.window.showWarningMessage('Agent not found.');
      }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to toggle agent status: ${message}`);
  }
}

/**
 * Command to refresh statistics for an agent
 */
async function refreshAgentStats(): Promise<void> {
  if (!agentService) {
    vscode.window.showErrorMessage('Agent Service not initialized.');
    return;
  }

  // Get all agents
  const agents = await agentService.getAgents();
  if (!agents.length) {
    vscode.window.showInformationMessage('No agents found to refresh statistics for.');
    return;
  }

  // Create QuickPick items with agent name and current status
  const agentPicks = agents.map(a => ({ 
    label: a.name, 
    description: `(${a.type}) - ${a.status}`, 
    id: a.id 
  }));
  
  // Show QuickPick to select an agent
  const selectedAgent = await vscode.window.showQuickPick(agentPicks, { 
    placeHolder: 'Select agent to refresh statistics' 
  });
  
  if (!selectedAgent) return;

  try {
    // Show progress while refreshing
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Refreshing statistics for ${selectedAgent.label}...`,
      cancellable: false
    }, async () => {
      if (!agentService) {
        throw new Error('Agent Service not initialized.');
      }
      await agentService.refreshAgentStats(selectedAgent.id);
    });

    vscode.window.showInformationMessage(`Statistics for ${selectedAgent.label} refreshed successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to refresh statistics: ${message}`);
  }
}

/**
 * Command to refresh statistics for ALL agents.
 */
async function refreshAllAgentStats(): Promise<void> {
  if (!agentService) {
    vscode.window.showErrorMessage('Agent Service not initialized.');
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Refresh statistics for all agents? This may take some time.`, 
    { modal: true }, 
    'Refresh All'
  );

  if (confirmation !== 'Refresh All') return;

  try {
    let result: { successCount: number; errorCount: number } | undefined;
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Refreshing statistics for all agents...',
      cancellable: false // Ideally, we'd allow cancellation, but it's complex with Promise.allSettled
    }, async (progress) => {
      progress.report({ increment: 0, message: 'Starting batch refresh...' });
      if (!agentService) { // Need check inside async callback too
        throw new Error('Agent Service became unavailable.');
      }
      result = await agentService.refreshAllAgentStats();
      progress.report({ increment: 100, message: 'Batch refresh complete.' });
    });

    if (result) {
        const message = `Batch refresh complete. Success: ${result.successCount}, Errors: ${result.errorCount}.`;
        if (result.errorCount > 0) {
            vscode.window.showWarningMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    } else {
         vscode.window.showWarningMessage('Batch refresh process did not return results.');
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to refresh all agent stats:', message);
    vscode.window.showErrorMessage(`Failed to refresh all agent stats: ${message}`);
  }
}
