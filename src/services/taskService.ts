import * as vscode from 'vscode'
import { Task, TaskMetadata, TaskPriority, TaskStatus, sortTasks } from '../models/task'

const TASKS_STORAGE_KEY = 'ProjectRules.tasks'

export class TaskService {
  private static instance: TaskService
  private _context: vscode.ExtensionContext
  private _tasks: Map<string, Task> = new Map()

  private _onTasksDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  public readonly onTasksDidChange: vscode.Event<void> = this._onTasksDidChange.event

  private constructor(context: vscode.ExtensionContext) {
    this._context = context
    this._loadTasksFromGlobalState()
  }

  public static getInstance(context: vscode.ExtensionContext): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService(context)
    }
    return TaskService.instance
  }

  private _loadTasksFromGlobalState(): void {
    const storedTasks = this._context.globalState.get<Task[]>(TASKS_STORAGE_KEY, [])
    if (Array.isArray(storedTasks)) {
      this._tasks = new Map(storedTasks.map(task => [task.metadata.id, task]))
    } else {
      this._tasks = new Map()
      console.warn('TaskService: Invalid data found in globalState, initializing empty task list.')
      this._context.globalState.update(TASKS_STORAGE_KEY, []) // Clear invalid data
    }
    console.log(`TaskService: Loaded ${this._tasks.size} tasks from globalState.`)
    // No need to notify on initial load, views will fetch when ready
  }

  private _saveTasksToGlobalState(): void {
    const tasksArray = Array.from(this._tasks.values())
    this._context.globalState.update(TASKS_STORAGE_KEY, tasksArray)
      .then(() => {
        // console.log(`TaskService: Saved ${tasksArray.length} tasks to globalState.`) // Less verbose log
        this._notifyChanges()
      }, (error) => {
        console.error("TaskService: Failed to save tasks to globalState:", error)
        // Potentially show error to user if saving is critical
      })
  }

  private _notifyChanges(): void {
    this._onTasksDidChange.fire()
  }

  public getAllTasks(): Task[] {
    return sortTasks(Array.from(this._tasks.values()))
  }

  public getTaskById(id: string): Task | undefined {
    return this._tasks.get(id)
  }

  // Use correct types matching the Task model
  public async createTask(taskData: { title: string } & Partial<Omit<Task, 'metadata'>> & { metadata?: Partial<Omit<TaskMetadata, 'id' | 'createdAt' | 'updatedAt'>> }): Promise<Task> {
    const now = Date.now()
    // Generate ID internally, don't read from taskData.metadata.id as the type prevents it
    const id = `task_${now}_${Math.random().toString(36).substr(2, 9)}`

    const metadata: TaskMetadata = {
      id,
      title: taskData.title, // Required
      description: taskData.metadata?.description,
      assignedTo: taskData.metadata?.assignedTo,
      dueDate: taskData.metadata?.dueDate,
      createdAt: now,
      updatedAt: now,
      syncStatus: taskData.metadata?.syncStatus ?? 'local-only',
      aiGenerated: taskData.metadata?.aiGenerated ?? false,
      lastError: taskData.metadata?.lastError,
      complexity: taskData.metadata?.complexity,
    }

    const newTask: Task = {
      metadata,
      status: taskData.status ?? 'todo',
      priority: taskData.priority ?? 'medium',
      ruleId: taskData.ruleId, // Can be undefined
    }

    this._tasks.set(id, newTask)
    this._saveTasksToGlobalState()
    console.log(`TaskService: Created task "${newTask.metadata.title}" (ID: ${id})`)
    return newTask
  }

  // Use correct types matching the Task model
  public async updateTask(id: string, updates: Partial<Omit<Task, 'metadata'>> & { metadata?: Partial<Omit<TaskMetadata, 'id' | 'createdAt'>> }): Promise<Task | undefined> {
    const existingTask = this._tasks.get(id)
    if (!existingTask) {
      console.error(`TaskService: Task not found for update: ${id}`)
      return undefined
    }

    const updatedMetadata: TaskMetadata = {
      ...existingTask.metadata,
      ...updates.metadata,
      id: existingTask.metadata.id, // Keep original ID
      createdAt: existingTask.metadata.createdAt, // Keep original creation date
      updatedAt: Date.now(), // Update timestamp
    }

    const updatedTask: Task = {
      metadata: updatedMetadata,
      // Use ?? to fall back to existing value if update property is undefined/null
      status: updates.status ?? existingTask.status,
      priority: updates.priority ?? existingTask.priority,
      ruleId: updates.ruleId ?? existingTask.ruleId,
    }

    // Optional validation can be added here if needed

    this._tasks.set(id, updatedTask)
    this._saveTasksToGlobalState()
    console.log(`TaskService: Updated task "${updatedTask.metadata.title}" (ID: ${id})`)
    return updatedTask
  }

  public async deleteTask(id: string): Promise<boolean> {
    const deleted = this._tasks.delete(id)
    if (deleted) {
      this._saveTasksToGlobalState()
      console.log(`TaskService: Deleted task (ID: ${id})`)
    }
    return deleted
  }

  // Placeholder - needs actual AI call via AiService
  public async estimateTaskEffort(taskId: string): Promise<{ complexity: number, estimatedHours: number } | null> {
    const task = this.getTaskById(taskId)
    if (!task) {
      console.error(`TaskService: Task not found for effort estimation: ${taskId}`)
      return null
    }

    console.warn("TaskService.estimateTaskEffort: Placeholder implementation. Needs AI integration.")
    // TODO: Integrate with AiService properly here
    // const aiService = new AiService(this._context) // Need a way to access AiService instance
    // const prompt = this._buildPromptForEffortEstimation(task) // Need this method
    // const estimationResult = await aiService.analyzeWithAI<{ complexity: number, estimatedHours: number }>(prompt)

    // Placeholder logic:
    const complexity = Math.min(5, Math.max(1, Math.ceil((task.metadata.description?.length || 0) / 50) || 1))
    const estimatedHours = complexity * 2

    // Update the task with the estimated complexity
    await this.updateTask(taskId, { metadata: { complexity } })

    console.log(`TaskService: Estimated complexity ${complexity}/5 for task ${taskId}`)
    return { complexity, estimatedHours }
  }

  // --- TODO: Add _buildPromptForEffortEstimation if needed here or move to TaskAiService ---
  /*
  private _buildPromptForEffortEstimation(task: Task): string {
    // (Retrieve this prompt logic from TaskAiService if it exists there)
    return `Estimate the complexity and effort required for the following task:

    TITLE: ${task.metadata.title}
    DESCRIPTION: ${task.metadata.description || 'No description provided'}

    Analyze the technical requirements and scope of this task to provide:
    1. A complexity score on a scale of 1-5 (1 being simplest, 5 being most complex)
    2. An estimated number of hours to complete this task

    Format your response as a JSON object with 'complexity' and 'estimatedHours' properties.`;
  }
  */
}

// Export a singleton instance for easier imports
export const taskService = TaskService
