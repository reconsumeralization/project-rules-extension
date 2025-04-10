import * as vscode from 'vscode'
import * as path from 'path'
import * as ruleController from './controllers/ruleController'
import * as localStorageService from './services/localStorageService' // Needed for watcher path
import * as cacheService from './services/cacheService' // Import cache service
import { RulesViewProvider } from './views/rulesView-provider'
import { TasksViewProvider } from './views/tasksView'
import * as taskController from './controllers/taskController'
import * as syncController from './controllers/syncController'
import { ServerService } from './services/serverService'; // Import ServerService class
import { TaskAiService } from './services/taskAiService'; // Import TaskAiService class
import { McpAgentService } from './services/mcpAgentService'
import { McpAgentsViewProvider } from './views/mcpAgentsView'
import * as agentController from './controllers/agentController' // Import agent controller
import * as mcpServerController from './controllers/mcpserverController' // Import MCP server controller
import * as aiAutonomyController from './controllers/aiAutonomyController'; // Import AI Autonomy controller
import { AiAutonomyService } from './services/aiAutonomyService'; // Import AiAutonomyService class
import { TaskController } from './controllers/taskController'
import { TaskService } from './services/taskService'

const RULE_EXTENSION = '.mdc'
const WORKSPACE_RULES_DIR_NAME = '.cursor/rules'
const DELETED_RULES_QUEUE_KEY = 'deletedRuleIdsToSync'

let fileWatcher: vscode.FileSystemWatcher | undefined

export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating Cursor Rules extension...')
  
  try {
    // Register the RulesViewProvider
    const rulesViewProvider = new RulesViewProvider(context)
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        RulesViewProvider.viewType,
        rulesViewProvider
      )
    )
    
    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('ProjectRules.testCommand', () => {
        vscode.window.showInformationMessage('Cursor Rules extension is working!')
      })
    )
    
    // Command to show the create rule dialog in the webview
    context.subscriptions.push(
      vscode.commands.registerCommand('ProjectRules.createRule', () => {
        rulesViewProvider.showCreateDialog()
      })
    )
    
    console.log('Cursor Rules extension activated successfully.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error in activate:', error)
    vscode.window.showErrorMessage(`Cursor Rules Error: ${message}`)
  }
  
  /*
  // Original code commented out for testing
  try {
    console.log('Initializing services...')
    const storageManager = new LocalStorageService(context.workspaceState)
    // ... rest of the original code
  } catch (error) {
    handleError(error, 'activate')
    console.error('Cursor Rules activation failed catastrophically.')
  }
  */
}

export function deactivate() {
  console.log('Deactivating Cursor Rules extension...')
  // Clean up resources, stop background processes, etc.
} 