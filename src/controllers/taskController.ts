import * as vscode from 'vscode'
import * as path from 'path'
import * as crypto from 'crypto'
import { Task, TaskStatus, TaskPriority, TaskMetadata, createTask, sortTasks } from '../models/task'
import * as localStorageService from '../services/localStorageService'
import * as syncController from './syncController'
import * as ruleController from './ruleController'
import { TaskAiService } from '../services/taskAiService'
import { TaskService } from '../services/taskService'

// --- Constants ---
const TASKS_STORAGE_KEY = 'ProjectRulesTasks'

// --- Module State ---
let tasksMap = new Map<string, Task>()
const onTasksDidChangeEmitter = new vscode.EventEmitter<void>()
let taskAiService: TaskAiService | undefined

// --- Public Controller Functions ---

/**
 * Initializes the TaskController by loading tasks from extension storage.
 */
export async function initializeTaskController(context: vscode.ExtensionContext): Promise<void> {
  const savedTasks = context.globalState.get<Task[]>(TASKS_STORAGE_KEY, [])
  tasksMap = new Map(savedTasks.map(task => [task.metadata.id, task]))
  console.log(`Initialized TaskController with ${tasksMap.size} tasks.`)
  
  // Initialize AI service
  taskAiService = new TaskAiService(context)
  
  onTasksDidChangeEmitter.fire()
}

/**
 * Event that fires when tasks change.
 */
export const onTasksDidChange: vscode.Event<void> = onTasksDidChangeEmitter.event

/**
 * Gets all tasks.
 */
export function getTasks(): Task[] {
  return sortTasks(Array.from(tasksMap.values()))
}

/**
 * Gets tasks associated with a specific rule.
 */
export function getTasksForRule(ruleId: string): Task[] {
  return sortTasks(Array.from(tasksMap.values()).filter(task => task.ruleId === ruleId))
}

/**
 * Gets a task by ID.
 */
export function getTaskById(taskId: string): Task | undefined {
  return tasksMap.get(taskId)
}

/**
 * Creates a new task.
 */
export async function createNewTask(
  context: vscode.ExtensionContext,
  {
    title,
    description,
    assignedTo,
    dueDate,
    status = 'todo',
    priority = 'medium',
    ruleId
  }: {
    title: string
    description?: string
    assignedTo?: string
    dueDate?: number
    status?: TaskStatus
    priority?: TaskPriority
    ruleId?: string
  }
): Promise<Task> {
  // Generate a unique ID
  const taskId = crypto.randomUUID()
  
  const task = createTask({
    id: taskId,
    title,
    description,
    assignedTo,
    dueDate,
    status,
    priority,
    ruleId
  })
  
  // Add to map and persist
  tasksMap.set(taskId, task)
  await saveTasksToStorage(context)
  
  // Notify listeners
  onTasksDidChangeEmitter.fire()
  
  // Show confirmation
  vscode.window.showInformationMessage(`Created task: ${title}`)
  
  return task
}

/**
 * Updates an existing task.
 */
export async function updateTask(
  context: vscode.ExtensionContext,
  taskId: string,
  updates: Partial<Omit<Task, 'metadata'> & Omit<TaskMetadata, 'id' | 'createdAt' | 'syncStatus'>>
): Promise<Task | undefined> {
  const task = tasksMap.get(taskId)
  if (!task) {
    vscode.window.showWarningMessage(`Task with ID "${taskId}" not found.`)
    return undefined
  }
  
  // Create updated task
  const updatedTask: Task = {
    ...task,
    metadata: {
      ...task.metadata,
      title: updates.title ?? task.metadata.title,
      description: updates.description ?? task.metadata.description,
      assignedTo: updates.assignedTo ?? task.metadata.assignedTo,
      dueDate: updates.dueDate ?? task.metadata.dueDate,
      updatedAt: Date.now(),
      // If previously synced, mark as local-only after update
      syncStatus: task.metadata.syncStatus === 'synced' ? 'local-only' : task.metadata.syncStatus
    },
    status: updates.status ?? task.status,
    priority: updates.priority ?? task.priority,
    ruleId: updates.ruleId ?? task.ruleId
  }
  
  // Update map and persist
  tasksMap.set(taskId, updatedTask)
  await saveTasksToStorage(context)
  
  // Notify listeners
  onTasksDidChangeEmitter.fire()
  
  return updatedTask
}

/**
 * Deletes a task.
 */
export async function deleteTask(context: vscode.ExtensionContext, taskId: string): Promise<boolean> {
  const task = tasksMap.get(taskId)
  if (!task) {
    vscode.window.showWarningMessage(`Cannot delete: Task with ID "${taskId}" not found.`)
    return false
  }
  
  const deleted = tasksMap.delete(taskId)
  if (deleted) {
    await saveTasksToStorage(context)
    onTasksDidChangeEmitter.fire()
    vscode.window.showInformationMessage(`Deleted task: ${task.metadata.title}`)
  }
  
  return deleted
}

/**
 * Adds a batch of tasks, typically from sync or bulk import.
 */
export async function addOrUpdateTasks(context: vscode.ExtensionContext, tasks: Task[]): Promise<void> {
  let updated = false
  
  for (const task of tasks) {
    if (!task.metadata?.id) {continue}
    
    tasksMap.set(task.metadata.id, task)
    updated = true
  }
  
  if (updated) {
    await saveTasksToStorage(context)
    onTasksDidChangeEmitter.fire()
  }
}

/**
 * Updates task status.
 */
export async function updateTaskStatus(
  context: vscode.ExtensionContext,
  taskId: string,
  status: TaskStatus
): Promise<Task | undefined> {
  return updateTask(context, taskId, { status })
}

/**
 * Marks a task as completed.
 */
export async function completeTask(context: vscode.ExtensionContext, taskId: string): Promise<Task | undefined> {
  return updateTaskStatus(context, taskId, 'completed')
}

/**
 * Generates tasks for a specific rule using AI analysis
 */
export async function generateTasksForRule(
  context: vscode.ExtensionContext,
  ruleId: string
): Promise<Task[]> {
  if (!taskAiService) {
    taskAiService = new TaskAiService(context)
  }
  
  try {
    // Show progress notification
    const tasks = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating tasks from rule...',
        cancellable: false
      },
      async () => {
        // Generate tasks using AI
        const generatedTasks = await taskAiService!.generateTasksFromRule(ruleId)
        
        // Add tasks to storage
        for (const task of generatedTasks) {
          // Ensure proper syncStatus is set
          if (!task.metadata.syncStatus) {
            // Create a new task with the correct syncStatus instead of modifying readonly property
            const taskWithSyncStatus: Task = {
              metadata: {
                ...task.metadata,
                syncStatus: 'local-only'
              },
              status: task.status,
              priority: task.priority,
              ruleId: task.ruleId
            }
            
            tasksMap.set(taskWithSyncStatus.metadata.id, taskWithSyncStatus)
          } else {
            tasksMap.set(task.metadata.id, task)
          }
        }
        
        // Save to storage
        await saveTasksToStorage(context)
        
        // Notify listeners
        onTasksDidChangeEmitter.fire()
        
        return generatedTasks
      }
    )
    
    // Show success message
    vscode.window.showInformationMessage(`Generated ${tasks.length} tasks from rule.`)
    
    return tasks
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to generate tasks: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/**
 * Creates a task from natural language description using AI
 */
export async function createTaskFromDescription(
  context: vscode.ExtensionContext,
  description: string
): Promise<Task | undefined> {
  if (!taskAiService) {
    taskAiService = new TaskAiService(context)
  }
  
  try {
    // Show progress notification
    const task = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Processing task description...',
        cancellable: false
      },
      async () => {
        // Parse description using AI
        const parsedTask = await taskAiService!.parseTaskDescription(description)
        
        // Generate task ID
        const id = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
        
        // Create task with parsed data
        const newTask = createTask({
          id,
          title: parsedTask.metadata?.title || description.substring(0, 50),
          description: parsedTask.metadata?.description,
          assignedTo: parsedTask.metadata?.assignedTo,
          dueDate: parsedTask.metadata?.dueDate,
          status: parsedTask.status || 'todo',
          priority: parsedTask.priority || 'medium',
          ruleId: parsedTask.ruleId,
          syncStatus: 'local-only'
        })
        
        // Create a new task with AI-generated flag instead of modifying readonly property
        const aiGeneratedTask: Task = {
          metadata: {
            ...newTask.metadata,
            aiGenerated: true
          },
          status: newTask.status,
          priority: newTask.priority,
          ruleId: newTask.ruleId
        }
        
        // Add to storage
        tasksMap.set(id, aiGeneratedTask)
        await saveTasksToStorage(context)
        onTasksDidChangeEmitter.fire()
        
        return aiGeneratedTask
      }
    )
    
    vscode.window.showInformationMessage(`Created task: ${task.metadata.title}`)
    return task
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create task: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * Shows tasks for a specific rule, generating them if needed
 */
export async function showTasksForRule(ruleId: string): Promise<void> {
  // Get context from extension activation
  const extension = vscode.extensions.getExtension('cursor.cursor-rules')
  if (!extension) {
    vscode.window.showErrorMessage('Extension not found')
    return
  }
  
  const context = extension.isActive ? extension.exports.getExtensionContext() : undefined
  if (!context) {
    vscode.window.showErrorMessage('Extension context not available')
    return
  }
  
  // Get tasks for this rule
  const ruleTasks = Array.from(tasksMap.values()).filter(task => task.ruleId === ruleId)
  
  // If no tasks exist, offer to generate them
  if (ruleTasks.length === 0) {
    const generateOption = 'Generate tasks for this rule'
    const result = await vscode.window.showInformationMessage(
      'No tasks found for this rule. Would you like to generate tasks using AI?',
      generateOption,
      'Cancel'
    )
    
    if (result === generateOption) {
      await generateTasksForRule(context, ruleId)
    }
  }
  
  // Focus the tasks view
  await vscode.commands.executeCommand('ProjectRules.tasksView.focus')
}

// --- Helper Functions ---

/**
 * Saves all tasks to extension storage.
 */
async function saveTasksToStorage(context: vscode.ExtensionContext): Promise<void> {
  const tasks = Array.from(tasksMap.values())
  await context.globalState.update(TASKS_STORAGE_KEY, tasks)
}

function getStatusSymbol(status: TaskStatus): string {
  switch (status) {
    case 'todo': return '[ ] '
    case 'in-progress': return '[→] '
    case 'completed': return '[✓] '
    case 'blocked': return '[⚠] '
    default: return ''
  }
}

function getPriorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case 'low': return 'Low Priority'
    case 'medium': return 'Medium Priority'
    case 'high': return 'High Priority'
    case 'critical': return 'CRITICAL'
    default: return ''
  }
}

export class TaskController {
  private _taskService: TaskService
  private _context: vscode.ExtensionContext

  constructor(taskServiceInstance: TaskService, context: vscode.ExtensionContext) {
    this._taskService = taskServiceInstance
    this._context = context

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('ProjectRules.assignTaskToMe', this.assignTaskToMe, this),
      vscode.commands.registerCommand('ProjectRules.estimateTaskComplexity', this.estimateTaskComplexity, this)
    )
  }

  // --- Command Implementations ---

  private async assignTaskToMe(taskId: string | undefined): Promise<void> {
    if (!taskId) {
      // If taskId is not provided directly (e.g., called from command palette),
      // we might need to prompt the user to select a task.
      // For now, assume it's called with a taskId (e.g., from a UI element).
      vscode.window.showWarningMessage('Please select a task to assign.')
      return
    }

    const currentUser = await this.getCurrentUserIdentifier()
    if (!currentUser) {
      vscode.window.showWarningMessage('Could not determine your user identity. Check settings.')
      return
    }

    try {
      const updatedTask = await this._taskService.updateTask(taskId, {
        metadata: {
          assignedTo: currentUser
        }
      })

      if (updatedTask) {
        vscode.window.showInformationMessage(`Task "${updatedTask.metadata.title}" assigned to ${currentUser}.`)
        // Optionally refresh the tasks view
        vscode.commands.executeCommand('ProjectRules.refreshTasksView')
      } else {
        vscode.window.showWarningMessage(`Could not find task with ID ${taskId}.`)
      }
    } catch (error) {
      console.error(`Error assigning task ${taskId} to ${currentUser}:`, error)
      const message = error instanceof Error ? error.message : String(error)
      vscode.window.showErrorMessage(`Failed to assign task: ${message}`)
    }
  }

  private async estimateTaskComplexity(taskId: string | undefined): Promise<void> {
    if (!taskId || typeof taskId !== 'string') {
      vscode.window.showErrorMessage('Estimate Complexity: Invalid Task ID provided.')
      return
    }

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Estimating complexity for task ID: ${taskId}...`,
      cancellable: false
    }, async (progress) => {
      try {
        // Initialize AI service if needed
        if (!taskAiService) {
          taskAiService = new TaskAiService(this._context)
        }
        
        // Get the task
        const task = getTaskById(taskId)
        if (!task) {
          vscode.window.showWarningMessage(`Could not find task with ID ${taskId}.`)
          return
        }
        
        // Use the AI service to estimate complexity
        const estimation = await taskAiService.estimateTaskEffort(task)
        
        if (estimation && estimation.complexity) {
          // Update the task with the complexity information
          await updateTask(this._context, taskId, { 
            complexity: estimation.complexity 
          } as any)
          
          vscode.window.showInformationMessage(`Estimated complexity for task ${taskId}: ${estimation.complexity}/5.`)
          vscode.commands.executeCommand('ProjectRules.refreshTasksView')
        } else {
          vscode.window.showWarningMessage(`Could not estimate complexity for task ${taskId}.`)
        }
      } catch (error: any) {
        console.error(`Error estimating complexity for task ${taskId}:`, error)
        vscode.window.showErrorMessage(`Failed to estimate complexity: ${error.message}`)
      }
    })
  }

  // --- Helpers ---

  private async getCurrentUserIdentifier(): Promise<string | undefined> {
    // Try to get a user identifier (e.g., from config, git user, etc.)
    const config = vscode.workspace.getConfiguration('ProjectRules.user')
    let userId = config.get<string>('identifier')

    if (userId) {return userId}

    // Fallback: Try git user email
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')
      if (gitExtension?.isActive) {
        const gitApi = gitExtension.exports.getAPI(1)
        if (gitApi && gitApi.repositories.length > 0) {
          const repo = gitApi.repositories[0] // Use first repo
          const userEmail = await repo.getConfig('user.email')
          if (userEmail) {
            console.log(`Identified user via git config: ${userEmail}`)
            return userEmail
          }
        }
      }
    } catch (gitError) {
      console.warn('Could not get user identity from git:', gitError)
    }
    
    // Fallback: Prompt user
    userId = await vscode.window.showInputBox({ 
      prompt: 'Enter your username or email to assign tasks', 
      placeHolder: 'your.email@example.com or username',
      ignoreFocusOut: true 
    })
    
    if (userId) {
      // Optionally save this back to config?
      // await config.update('identifier', userId, vscode.ConfigurationTarget.Global);
      return userId
    }

    return undefined
  }
}

export function initialize(context: vscode.ExtensionContext, taskAiService: TaskAiService, taskService: TaskService) {
  throw new Error('Function not implemented.')
}
