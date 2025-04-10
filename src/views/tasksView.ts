import * as vscode from 'vscode'
import * as path from 'path'
import * as taskController from '../controllers/taskController'
import * as ruleController from '../controllers/ruleController'
import { Task } from '../models/task'

export class TasksViewProvider implements vscode.WebviewViewProvider {
  refresh(): any {
    throw new Error('Method not implemented.')
  }
  public static readonly viewType = 'ProjectRules.tasksView'

  private _view?: vscode.WebviewView
  private _context: vscode.ExtensionContext
  private _taskChangeSubscription?: vscode.Disposable

  constructor(context: vscode.ExtensionContext) {
    this._context = context
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._view = webviewView

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      // Restrict the webview to only loading resources from the extension's media directory
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
        // Add path for icons
        vscode.Uri.joinPath(
          this._context.extensionUri,
          'node_modules',
          '@vscode',
          'codicons',
          'dist',
        ),
      ],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      console.log('Received message from tasks webview:', message)
      
      switch (message.command) {
        case 'getTasks':
          this._sendTasks()
          break
          
        case 'getRules':
          this._sendRules()
          break
          
        case 'getUsers':
          this._sendUsers()
          break
          
        case 'createTask':
          if (message.task) {
            await this._createTask(message.task)
          }
          break
          
        case 'updateTask':
          if (message.taskId && message.task) {
            await this._updateTask(message.taskId, message.task)
          }
          break
          
        case 'updateTaskStatus':
          if (message.taskId && message.status) {
            await this._updateTaskStatus(message.taskId, message.status)
          }
          break
          
        case 'deleteTask':
          if (message.taskId) {
            await this._deleteTask(message.taskId)
          }
          break
          
        case 'showNotification':
          if (message.message) {
            const type = message.type === 'error' ? 
              vscode.window.showErrorMessage : 
              vscode.window.showInformationMessage
            type(message.message)
          }
          break
          
        // Add handler for executing commands
        case 'executeCommand':
            if (message.commandId && typeof message.commandId === 'string') {
                console.log(`TasksViewProvider: Executing command: ${message.commandId} with args:`, message.args);
                // Use apply to pass arguments array to executeCommand
                vscode.commands.executeCommand(message.commandId, ...(message.args || []))
                    .then(undefined, (err) => { // Handle potential errors from command execution
                         console.error(`TasksViewProvider: Error executing command ${message.commandId}:`, err);
                         if(this._view) {
                             this._view.webview.postMessage({ 
                                 command: 'error', // Use 'error' command for webview JS
                                 message: `Error executing command: ${err.message || 'Unknown error'}`,
                             });
                         }
                    });
            } else {
                console.error('TasksViewProvider: Invalid executeCommand message received', message);
            }
            break;
      }
    })

    // Update the view when it becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendTasks()
        this._sendRules()
        this._sendUsers()
      }
    })

    // Dispose subscription when view is disposed
    webviewView.onDidDispose(() => {
      this._taskChangeSubscription?.dispose()
      this._view = undefined
    }, null, this._context.subscriptions)

    // Listen for task changes from the controller
    this._taskChangeSubscription = taskController.onTasksDidChange(() => {
      console.log('TasksViewProvider: Detected task change, updating view.')
      this._sendTasks()
    })
    this._context.subscriptions.push(this._taskChangeSubscription)

    // Initial update
    console.log('TasksViewProvider: Performing initial data load.')
    this._sendTasks()
    this._sendRules()
    this._sendUsers()
  }

  private async _createTask(taskData: any): Promise<void> {
    try {
      const newTask = await taskController.createNewTask(this._context, {
        title: taskData.title,
        description: taskData.description,
        status: this._convertStatus(taskData.status),
        priority: this._convertPriority(taskData.priority),
        assignedTo: taskData.assignee || undefined,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).getTime() : undefined,
        ruleId: taskData.relatedRuleId || undefined
      })
      
      // Send back task created success
      this._view?.webview.postMessage({
        command: 'taskCreated',
        task: this._formatTaskForWebview(newTask)
      })
      
    } catch (error) {
      console.error('Error creating task:', error)
      this._view?.webview.postMessage({
        command: 'error',
        message: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  private async _updateTask(taskId: string, taskData: any): Promise<void> {
    try {
      const updatedTask = await taskController.updateTask(this._context, taskId, {
        title: taskData.title,
        description: taskData.description,
        status: this._convertStatus(taskData.status),
        priority: this._convertPriority(taskData.priority),
        assignedTo: taskData.assignee || undefined,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).getTime() : undefined,
        ruleId: taskData.relatedRuleId || undefined
      })
      
      if (updatedTask) {
        this._view?.webview.postMessage({
          command: 'taskUpdated',
          task: this._formatTaskForWebview(updatedTask)
        })
      } else {
        throw new Error('Task not found')
      }
      
    } catch (error) {
      console.error('Error updating task:', error)
      this._view?.webview.postMessage({
        command: 'error',
        message: `Failed to update task: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  private async _updateTaskStatus(taskId: string, status: string): Promise<void> {
    try {
      const convertedStatus = this._convertStatus(status)
      const updatedTask = await taskController.updateTaskStatus(this._context, taskId, convertedStatus)
      
      if (updatedTask) {
        this._view?.webview.postMessage({
          command: 'taskUpdated',
          task: this._formatTaskForWebview(updatedTask)
        })
      } else {
        throw new Error('Task not found')
      }
      
    } catch (error) {
      console.error('Error updating task status:', error)
      this._view?.webview.postMessage({
        command: 'error',
        message: `Failed to update task status: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  private async _deleteTask(taskId: string): Promise<void> {
    try {
      const success = await taskController.deleteTask(this._context, taskId)
      
      if (success) {
        this._view?.webview.postMessage({
          command: 'taskDeleted',
          taskId
        })
      } else {
        throw new Error('Failed to delete task')
      }
      
    } catch (error) {
      console.error('Error deleting task:', error)
      this._view?.webview.postMessage({
        command: 'error',
        message: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  private _sendTasks(): void {
    if (!this._view) return
    
    const tasks = taskController.getTasks()
    const formattedTasks = tasks.map(this._formatTaskForWebview)
    
    this._view.webview.postMessage({
      command: 'tasksLoaded',
      tasks: formattedTasks
    })
  }

  private _sendRules(): void {
    if (!this._view) return
    
    const rules = ruleController.getRules()
    const formattedRules = rules.map(rule => ({
      id: rule.metadata.id,
      title: rule.metadata.filename
    }))
    
    this._view.webview.postMessage({
      command: 'rulesLoaded',
      rules: formattedRules
    })
  }

  private _sendUsers(): void {
    if (!this._view) return
    
    // This is a placeholder. In a real scenario, you might get users from another service
    // For now, we'll just send some sample users
    const users = [
      { id: 'user1', name: 'John Doe' },
      { id: 'user2', name: 'Jane Smith' },
      { id: 'user3', name: 'Alex Johnson' }
    ]
    
    this._view.webview.postMessage({
      command: 'usersLoaded',
      users
    })
  }

  private _formatTaskForWebview(task: Task): any {
    return {
      id: task.metadata.id,
      title: task.metadata.title,
      description: task.metadata.description || '',
      status: this._convertStatusForWebview(task.status),
      priority: this._convertPriorityForWebview(task.priority),
      assignee: task.metadata.assignedTo || '',
      dueDate: task.metadata.dueDate ? new Date(task.metadata.dueDate).toISOString().split('T')[0] : '',
      relatedRuleId: task.ruleId || '',
      createdAt: new Date(task.metadata.createdAt).toISOString(),
      updatedAt: new Date(task.metadata.updatedAt).toISOString()
    }
  }

  private _convertStatus(status: string): any {
    // Convert webview status strings to controller status values
    switch (status) {
      case 'pending': return 'todo'
      case 'in-progress': return 'in-progress'
      case 'completed': return 'completed'
      case 'blocked': return 'blocked'
      default: return 'todo'
    }
  }

  private _convertStatusForWebview(status: string): string {
    // Convert controller status values to webview status strings
    switch (status) {
      case 'todo': return 'pending'
      case 'in-progress': return 'in-progress'
      case 'completed': return 'completed'
      case 'blocked': return 'blocked'
      default: return 'pending'
    }
  }

  private _convertPriority(priority: string): any {
    // Convert webview priority strings to controller priority values
    switch (priority) {
      case 'high': return 'high'
      case 'medium': return 'medium'
      case 'low': return 'low'
      default: return 'medium'
    }
  }

  private _convertPriorityForWebview(priority: string): string {
    // Convert controller priority values to webview priority strings
    switch (priority) {
      case 'high': return 'high'
      case 'medium': return 'medium'
      case 'low': return 'low'
      case 'critical': return 'high'
      default: return 'medium'
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get paths to local resources
    const codiconsUri = this._getUri(webview, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    const styleUri = this._getUri(webview, 'media', 'tasksView.css')
    const scriptUri = this._getUri(webview, 'media', 'tasksView.js')
    
    // Read the HTML file from the media directory
    const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'tasksView.html')
    let html = ''
    
    try {
      // Instead of reading the file directly, we'll use a template approach
      // that's more reliable with webviews
      
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Cursor Rules Task Manager - Manage tasks related to your rules">
    <title>MCP Tasks Manager</title>
    <link rel="stylesheet" href="${codiconsUri}">
    <link rel="stylesheet" href="${styleUri}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.2/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>MCP Tasks Manager</h1>
            <div class="controls-bar">
              <div class="search-container">
                <input type="text" id="searchInput" placeholder="Search tasks...">
              </div>
              <div class="filters">
                <fieldset class="filter-fieldset">
                    <legend>Filter</legend>
                    <div class="filter-group">
                        <label for="statusFilter">$(filter) Status:</label>
                        <select id="statusFilter">
                            <option value="all">All</option>
                            <option value="pending">Pending</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="priorityFilter">$(warning) Priority:</label>
                        <select id="priorityFilter">
                            <option value="all">All Priorities</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="assigneeFilter">$(person) Assignee:</label>
                        <select id="assigneeFilter">
                            <option value="all">All Assignees</option>
                            <option value="unassigned">Unassigned</option>
                            <!-- Will be populated dynamically -->
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="ruleLinkFilter">$(book) Rule:</label>
                        <select id="ruleLinkFilter">
                            <option value="all">All Rules</option>
                            <!-- Options populated by JS -->
                        </select>
                    </div>
                </fieldset>
                <fieldset class="filter-fieldset">
                    <legend>Sort</legend>
                    <div class="filter-group">
                        <label for="sortBy">$(list-ordered) Sort By:</label>
                        <select id="sortBy">
                            <option value="updatedAt-desc">Last Updated</option>
                            <option value="createdAt-desc">Date Created</option>
                            <option value="dueDate-asc">Due Date</option>
                            <option value="priority-desc">Priority</option>
                        </select>
                    </div>
                </fieldset>
              </div>
            </div>
            
            <div class="header-controls">
                 <button id="generateTasksForRuleBtn" title="Generate tasks for the rule selected in the filter" disabled>$(sparkle) Generate Tasks</button>
                 <button id="addTaskBtn" title="Add New Task">$(add) Add Task</button>
            </div>
        </header>

        <div id="tasksContainer" class="tasks-container">
            <!-- Tasks will be loaded here dynamically -->
        </div>
    </div>

    <!-- Task Modal -->
    <div id="taskModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">New Task</h2>
                <button id="closeTaskModal" class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="taskForm">
                    <input type="hidden" id="taskId">
                    
                    <div class="form-group">
                        <label for="title">Title</label>
                        <input type="text" id="title" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea id="description"></textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="status">Status</label>
                            <select id="status" required>
                                <option value="pending">Pending</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="priority">Priority</label>
                            <select id="priority" required>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="assignee">Assignee</label>
                            <input type="text" id="assignee" placeholder="Enter name or email">
                        </div>
                        
                        <div class="form-group">
                            <label for="dueDate">Due Date</label>
                            <input type="date" id="dueDate">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="relatedRuleId">Related Rule</label>
                        <select id="relatedRuleId">
                            <option value="">None</option>
                            <!-- Will be populated dynamically -->
                        </select>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <div>
                    <button id="deleteTaskBtn" class="btn btn-danger">Delete</button>
                </div>
                <div class="btn-row">
                    <button id="cancelTaskBtn" class="btn btn-secondary">Cancel</button>
                    <button id="saveTaskBtn" class="btn btn-primary">Save Task</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div id="deleteModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Confirm Delete</h2>
                <button id="closeDeleteModal" class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to delete this task? This action cannot be undone.</p>
            </div>
            <div class="modal-footer">
                <button id="cancelDeleteBtn" class="btn btn-secondary">Cancel</button>
                <button id="confirmDeleteBtn" class="btn btn-danger">Delete</button>
            </div>
        </div>
    </div>

    <!-- Notification -->
    <div id="notification" class="notification">
        <span id="notificationText"></span>
    </div>

    <!-- Templates -->
    <template id="taskCardTemplate">
        <div class="task-card" data-id="" data-rule-id="">
            <div class="task-header">
                <h3 class="task-title"></h3>
                <div class="task-card-actions">
                    <!-- Add action buttons here -->
                    <button class="task-action-btn edit-task-btn" title="Edit Task">$(edit)</button>
                    <button class="task-action-btn goto-rule-btn" title="Go to Related Rule" style="display: none;">$(book)</button>
                    <!-- <button class="task-action-btn assign-self-btn" title="Assign to Me">$(person-add)</button> -->
                </div>
            </div>
            <div class="task-content">
                <p class="task-description"></p>
            </div>
            <div class="task-meta">
                <span class="task-priority" title="Priority"></span>
                <span class="task-status" title="Status"></span>
                <span class="task-due-date" title="Due Date">$(calendar) <span></span></span>
                <span class="task-assignee" title="Assignee">$(person) <span></span></span>
                <span class="task-related-rule-link" title="Related Rule">$(link) <span></span></span>
            </div>
            <!-- Removed old status buttons -->
        </div>
    </template>

    <template id="emptyStateTemplate">
        <div class="empty-state">
            <i class="fas fa-tasks fa-3x mb-md"></i>
            <h2>No Tasks Found</h2>
            <p>Get started by creating your first task or adjust your filters to see more results.</p>
            <button id="emptyStateAddBtn" class="btn btn-primary">
                <i class="fas fa-plus mr-sm"></i> Create Task
            </button>
        </div>
    </template>

    <script src="${scriptUri}"></script>
</body>
</html>`
      
    } catch (error) {
      console.error('Error reading HTML file:', error)
      return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
      </head>
      <body>
        <h1>Error loading tasks view</h1>
        <p>There was an error loading the tasks view. Please try again later.</p>
      </body>
      </html>`
    }
  }

  // Security helper to get resource URIs
  private _getUri(webview: vscode.Webview, ...p: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, ...p))
  }
} 