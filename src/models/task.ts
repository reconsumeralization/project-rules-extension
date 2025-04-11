import { Rule } from './rule'

export interface TaskMetadata {
  readonly id: string
  title: string
  description?: string
  assignedTo?: string
  dueDate?: number // Timestamp
  createdAt: number
  updatedAt: number
  syncStatus: 'synced' | 'local-only' | 'server-only' | 'conflict'
  aiGenerated?: boolean // Flag for AI-generated tasks
  lastError?: string // Add field to store the last processing error or blockage reason
  complexity?: number // Optional: AI-estimated complexity score (e.g., 1-5)
}

export interface Task {
  readonly metadata: TaskMetadata
  status: TaskStatus
  priority: TaskPriority
  ruleId?: string // Optional reference to associated rule
}

export type TaskStatus = 'todo' | 'in-progress' | 'completed' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

interface CreateTaskArgs {
  id: string
  title: string
  description?: string
  assignedTo?: string
  dueDate?: number
  status?: TaskStatus
  priority?: TaskPriority
  ruleId?: string
  syncStatus?: TaskMetadata['syncStatus']
}

/**
 * Creates a new Task object with the provided properties.
 */
export function createTask({
  id,
  title,
  description,
  assignedTo,
  dueDate,
  status = 'todo',
  priority = 'medium',
  ruleId,
  syncStatus = 'local-only'
}: CreateTaskArgs): Task {
  const now = Date.now()
  
  const metadata: TaskMetadata = {
    id,
    title,
    description,
    assignedTo,
    dueDate,
    createdAt: now,
    updatedAt: now,
    syncStatus
  }

  return {
    metadata,
    status,
    priority,
    ruleId
  }
}

/**
 * Generates a display string for the task's due date.
 */
export function getTaskDueDateDisplay(task: Task): string {
  if (!task.metadata.dueDate) {return 'No due date'}
  
  const dueDate = new Date(task.metadata.dueDate)
  return dueDate.toLocaleDateString()
}

/**
 * Generates CSS class based on task priority and status
 */
export function getTaskStatusClass(status: TaskStatus): string {
  switch (status) {
    case 'todo': return 'task-status-todo'
    case 'in-progress': return 'task-status-progress'
    case 'completed': return 'task-status-completed'
    case 'blocked': return 'task-status-blocked'
    default: return ''
  }
}

export function getTaskPriorityClass(priority: TaskPriority): string {
  switch (priority) {
    case 'low': return 'task-priority-low'
    case 'medium': return 'task-priority-medium'
    case 'high': return 'task-priority-high'
    case 'critical': return 'task-priority-critical'
    default: return ''
  }
}

// --- Utility Functions ---

/**
 * Checks if a task is overdue.
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.metadata.dueDate) {return false}
  if (task.status === 'completed') {return false}
  
  return Date.now() > task.metadata.dueDate
}

/**
 * Sorts tasks by priority, status, and due date.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // First sort by status (todo & in-progress first, then blocked, then completed)
    const statusOrder: Record<TaskStatus, number> = {
      'todo': 0,
      'in-progress': 1,
      'blocked': 2,
      'completed': 3
    }
    
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) {return statusDiff}
    
    // Then by priority (critical first)
    const priorityOrder: Record<TaskPriority, number> = {
      'critical': 0,
      'high': 1,
      'medium': 2,
      'low': 3
    }
    
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) {return priorityDiff}
    
    // Then by due date (earlier first, null dates last)
    if (a.metadata.dueDate && b.metadata.dueDate) {
      return a.metadata.dueDate - b.metadata.dueDate
    } else if (a.metadata.dueDate) {
      return -1 // a has due date, b doesn't
    } else if (b.metadata.dueDate) {
      return 1 // b has due date, a doesn't
    }
    
    // Finally by creation date
    return a.metadata.createdAt - b.metadata.createdAt
  })
} 