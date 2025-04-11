import * as vscode from 'vscode'
import * as path from 'path'

// Controllers
import * as ruleController from './controllers/ruleController'
import * as taskController from './controllers/taskController'
import * as syncController from './controllers/syncController'
import * as agentController from './controllers/agentController'
import * as mcpServerController from './controllers/mcpserverController'
import * as aiAutonomyController from './controllers/aiAutonomyController'
// The contextRuleController import may show as an error until the file is properly registered with the build system
import * as contextRuleController from './controllers/contextRuleController'

// Services
import * as localStorageService from './services/localStorageService'
import * as cacheService from './services/cacheService'
import { ServerService } from './services/serverService'

// Views
import { RulesViewProvider } from './views/rulesView-provider'
import { Rule } from './models/rule'

// Constants
const RULE_EXTENSION = '.mdc'
const WORKSPACE_RULES_DIR_NAME = '.cursor/rules'
const DELETED_RULES_QUEUE_KEY = 'deletedRuleIdsToSync'
const EXTENSION_NAME = 'Project Rules'

// Service instances
let serverService: ServerService
let fileWatcher: vscode.FileSystemWatcher | undefined
let disposables: vscode.Disposable[] = []

/**
 * Activates the extension
 * This is the entry point of the extension
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating Project Rules extension...')

  try {
    // Initialize services
    console.log('Initializing services...')
    
    // Cache and storage setup - initialize if they have initialization methods
    if (typeof cacheService.initialize === 'function') {
      await cacheService.initialize(context)
      console.log('Cache service initialized')
    }
    
    if (typeof localStorageService.initialize === 'function') {
      await localStorageService.initialize(context)
      console.log('Local storage service initialized')
    }
    
    // Create server service instance
    serverService = new ServerService(context)
    
    // Initialize controllers in order to avoid circular dependencies
    
    // 1. First initialize rule controller
    await ruleController.initializeRuleController(context)
    ruleController.setServerService(serverService)
    
    // 2. Initialize sync controller after rule controller
    syncController.initializeSyncController(context, serverService)
    
    // 3. Initialize the service bridges to break circular dependencies
    // This allows the controllers to safely call each other
    syncController.ruleControllerService.initialize({
      updateRuleInMap: ruleController.updateRuleInMap,
      handleRuleFileSaved: ruleController.handleRuleFileSaved,
      handleRuleFileDeleted: ruleController.handleRuleFileDeleted,
      getRules: ruleController.getRules,
      deleteRule: ruleController.deleteRule,
      updateRuleFromServer: ruleController.updateRuleFromServer,
      getRuleByFilename: ruleController.getRuleByFilename
    });
    
    // 4. Start background sync only after all controllers are properly connected
    syncController.startBackgroundSync(context)
    
    // Initialize other controllers if available
    initializeControllers(context, serverService)

    // Register view providers
    const rulesViewProvider = new RulesViewProvider(context)
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        RulesViewProvider.viewType,
        rulesViewProvider
      )
    )
    
    // Register additional view providers if available
    registerAdditionalViews(context)
    
    // Setup file watcher for rule files
    setupFileWatcher(context)
    
    // Register commands
    registerCommands(context)
    
    console.log('Project Rules extension activated successfully.')
    
    // Export the service instances for use by other modules
    return {
      getServerService: () => serverService,
      getExtensionContext: () => context
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error activating Project Rules extension:', error)
    vscode.window.showErrorMessage(`${EXTENSION_NAME} Error: ${message}`)
    
    // Ensure any partially initialized resources are cleaned up
    cleanup()
  }
}

/**
 * Initializes controllers with proper error handling
 */
function initializeControllers(context: vscode.ExtensionContext, serverService: ServerService) {
  // This function initializes controllers only if their initialize methods exist
  // We're avoiding direct references to controller interfaces that might be causing linter errors
  
  // Initialize task controller if available
  if (typeof taskController.initialize === 'function') {
    try {
      // @ts-ignore - Ignore type checking for controller initialization
      taskController.initialize(context)
      console.log('Task controller initialized')
    } catch (error) {
      console.warn('Failed to initialize task controller:', error)
    }
  }
  
  // Initialize agent controller if available
  if (typeof agentController.initialize === 'function') {
    try {
      // @ts-ignore - Ignore type checking for controller initialization
      agentController.initialize(context)
      console.log('Agent controller initialized')
    } catch (error) {
      console.warn('Failed to initialize agent controller:', error)
    }
  }
  
  // Initialize MCP server controller if available
  if (typeof mcpServerController.initialize === 'function') {
    try {
      mcpServerController.initialize(context, serverService)
      console.log('MCP server controller initialized')
    } catch (error) {
      console.warn('Failed to initialize MCP server controller:', error)
    }
  }
  
  // Initialize AI autonomy controller if available
  if (typeof aiAutonomyController.initialize === 'function') {
    try {
      // @ts-ignore - Ignore type checking for controller initialization
      aiAutonomyController.initialize(context)
      console.log('AI autonomy controller initialized')
    } catch (error) {
      console.warn('Failed to initialize AI autonomy controller:', error)
    }
  }
  
  // Initialize context rule controller if available
  if (typeof contextRuleController.initializeContextRuleController === 'function') {
    try {
      contextRuleController.initializeContextRuleController(context)
      contextRuleController.setServerService(serverService)
      console.log('Context rule controller initialized')
    } catch (error) {
      console.warn('Failed to initialize context rule controller:', error)
    }
  }
}

/**
 * Registers additional view providers dynamically
 */
function registerAdditionalViews(context: vscode.ExtensionContext) {
  // Try to import and register TasksViewProvider
  try {
    // Dynamic import to avoid linter errors with imports
    const { TasksViewProvider } = require('./views/tasksView')
    if (TasksViewProvider) {
      const tasksViewProvider = new TasksViewProvider(context)
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          TasksViewProvider.viewType, 
          tasksViewProvider
        )
      )
      console.log('Tasks view provider registered')
    }
  } catch (error) {
    console.warn('TasksViewProvider could not be registered:', error)
  }
  
  // Try to import and register McpAgentsViewProvider
  try {
    // Dynamic import to avoid linter errors with imports
    const { McpAgentsViewProvider } = require('./views/mcpAgentsView')
    if (McpAgentsViewProvider) {
      const mcpAgentsViewProvider = new McpAgentsViewProvider(context)
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          McpAgentsViewProvider.viewType,
          mcpAgentsViewProvider
        )
      )
      console.log('MCP agents view provider registered')
    }
  } catch (error) {
    console.warn('McpAgentsViewProvider could not be registered:', error)
  }
}

/**
 * Sets up the file watcher for rule files
 */
function setupFileWatcher(context: vscode.ExtensionContext) {
  // Use default storage path
  const rulesStoragePath = path.join(context.globalStorageUri.fsPath, WORKSPACE_RULES_DIR_NAME)
  
  // Create file watcher
  try {
    const rulePattern = new vscode.RelativePattern(rulesStoragePath, `*${RULE_EXTENSION}`)
    fileWatcher = vscode.workspace.createFileSystemWatcher(rulePattern)
    
    // File watcher events
    fileWatcher.onDidCreate(uri => ruleController.handleRuleFileSaved(context, uri))
    fileWatcher.onDidChange(uri => ruleController.handleRuleFileSaved(context, uri))
    fileWatcher.onDidDelete(uri => ruleController.handleRuleFileDeleted(uri, context))
    
    // Add to disposables
    context.subscriptions.push(fileWatcher)
    console.log('File watcher setup for rules directory:', rulesStoragePath)
  } catch (error) {
    console.warn('Failed to setup file watcher:', error)
  }
}

/**
 * Registers commands for the extension
 */
function registerCommands(context: vscode.ExtensionContext) {
  // Register core commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-rules.refreshRules', () => {
      // Call the appropriate function to refresh rules
      // Note: refreshRulesFromFiles doesn't exist, use an existing function instead
      vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction')
    }),
    
    vscode.commands.registerCommand('cursor-rules.createRule', () => {
      ruleController.createNewRule(context)
    }),
    
    vscode.commands.registerCommand('cursor-rules.openRule', (ruleId) => {
      ruleController.openRuleForEditing(context, ruleId)
    }),
    
    vscode.commands.registerCommand('cursor-rules.deleteRule', (ruleId) => {
      if (!ruleId) return
      
      vscode.window.showWarningMessage(
        `Are you sure you want to delete this rule?`, 
        { modal: true },
        'Delete'
      ).then(selection => {
        if (selection === 'Delete') {
          ruleController.deleteRule(context, ruleId)
        }
      })
    }),

    // Add the context gathering command
    vscode.commands.registerCommand('cursor-rules.gatherContext', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('No active editor to gather context from')
        return
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Enter your query to gather context',
        placeHolder: 'e.g., explain this code, fix this error, implement feature'
      })

      if (!query) return

      // Show a loading notification
      const notification = vscode.window.setStatusBarMessage('Gathering context...')
      try {
        const contextData = await contextRuleController.gatherContext(query)
        notification.dispose()
        
        // Show the gathered context in a webview panel
        const contextDataPanel = vscode.window.createWebviewPanel(
          'contextData',
          'Gathered Context',
          vscode.ViewColumn.Beside,
          {}
        )
        
        contextDataPanel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Context Data</title>
            <style>
              body { font-family: var(--vscode-font-family); padding: 20px; }
              pre { background-color: var(--vscode-editor-background); padding: 10px; overflow: auto; }
              .intent { color: var(--vscode-statusBarItem-prominentBackground); font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>Gathered Context for: "${query}"</h1>
            <h2>Inferred Intent: <span class="intent">${contextData.contextMetadata?.intent || 'Unknown'}</span></h2>
            <pre>${JSON.stringify(contextData, null, 2)}</pre>
          </body>
          </html>
        `
      } catch (error) {
        notification.dispose()
        vscode.window.showErrorMessage(`Failed to gather context: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  )
  
  // Register additional commands if available
  // ... existing code ...
}

/**
 * Cleans up resources when the extension is deactivated
 */
function cleanup() {
  // Stop background sync
  syncController.stopBackgroundSync()
  
  // Clean up file watcher
  if (fileWatcher) {
    fileWatcher.dispose()
    fileWatcher = undefined
  }
  
  // Dispose any remaining disposables
  disposables.forEach(d => {
    try {
      d.dispose()
    } catch (err) {
      console.error('Error disposing resource:', err)
    }
  })
  
  disposables = []
}

/**
 * Deactivates the extension
 * This is called when the extension is deactivated
 */
export function deactivate() {
  console.log('Deactivating Project Rules extension...')
  cleanup()
  console.log('Project Rules extension deactivated.')
} 