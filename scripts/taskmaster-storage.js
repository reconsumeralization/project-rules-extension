/**
 * Taskmaster Storage System
 * 
 * Provides a real filesystem-based implementation for task storage and retrieval
 * to replace the simulated commands in the taskmaster workflow scripts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const STORAGE_DIR = path.join(__dirname, '..', 'data', 'taskmaster');
const TASKS_FILE = path.join(STORAGE_DIR, 'tasks.json');
const TASK_LOG_DIR = path.join(STORAGE_DIR, 'logs');

// Ensure storage directories exist
function ensureStorageDirectories() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASK_LOG_DIR)) {
    fs.mkdirSync(TASK_LOG_DIR, { recursive: true });
  }
}

// Task model structure (matching our Task type in models/task.ts)
// status: 'todo' | 'in-progress' | 'completed' | 'blocked'
// priority: 'low' | 'medium' | 'high' | 'critical'

/**
 * Load all tasks from storage
 */
function loadTasks() {
  ensureStorageDirectories();
  
  if (!fs.existsSync(TASKS_FILE)) {
    // Initialize with empty tasks array
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading tasks:', error.message);
    return [];
  }
}

/**
 * Save all tasks to storage
 */
function saveTasks(tasks) {
  ensureStorageDirectories();
  
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving tasks:', error.message);
    return false;
  }
}

/**
 * Generate a unique ID for a task
 */
function generateTaskId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Create a new task with the given properties
 */
function createTask({ title, description = '', status = 'todo', priority = 'medium', parentId = null, phase = null }) {
  const now = Date.now();
  const id = generateTaskId();

  const task = {
    id,
    title,
    description,
    status,
    priority,
    parentId,
    phase,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);

  // Log the creation
  logTaskAction(id, 'create', task);
  
  return task;
}

/**
 * Update an existing task
 */
function updateTask(id, updates) {
  const tasks = loadTasks();
  const index = tasks.findIndex(task => task.id === id);
  
  if (index === -1) {
    console.error(`Task with ID ${id} not found`);
    return null;
  }
  
  const updatedTask = {
    ...tasks[index],
    ...updates,
    updatedAt: Date.now()
  };
  
  // If status is changing to completed, set completedAt
  if (updates.status === 'completed' && tasks[index].status !== 'completed') {
    updatedTask.completedAt = Date.now();
  }
  
  tasks[index] = updatedTask;
  saveTasks(tasks);

  // Log the update
  logTaskAction(id, 'update', updatedTask);
  
  return updatedTask;
}

/**
 * Delete a task by ID
 */
function deleteTask(id) {
  const tasks = loadTasks();
  const updatedTasks = tasks.filter(task => task.id !== id);
  
  if (updatedTasks.length === tasks.length) {
    console.error(`Task with ID ${id} not found`);
    return false;
  }
  
  saveTasks(updatedTasks);

  // Log the deletion
  logTaskAction(id, 'delete');
  
  return true;
}

/**
 * Get all tasks
 */
function getAllTasks() {
  return loadTasks();
}

/**
 * Get a task by ID
 */
function getTaskById(id) {
  const tasks = loadTasks();
  return tasks.find(task => task.id === id) || null;
}

/**
 * Get all subtasks for a parent task
 */
function getSubtasks(parentId) {
  const tasks = loadTasks();
  return tasks.filter(task => task.parentId === parentId);
}

/**
 * Get the current task (first in-progress task)
 */
function getCurrentTask() {
  const tasks = loadTasks();
  return tasks.find(task => task.status === 'in-progress') || null;
}

/**
 * Get the next task (first todo task)
 */
function getNextTask(phase = null) {
  const tasks = loadTasks();
  
  // Filter by phase if specified
  const filteredTasks = phase 
    ? tasks.filter(task => task.phase === phase && task.status === 'todo')
    : tasks.filter(task => task.status === 'todo');
  
  // Sort by priority (high to low)
  const sortedTasks = filteredTasks.sort((a, b) => {
    const priorityMap = { 'critical': 3, 'high': 2, 'medium': 1, 'low': 0 };
    return priorityMap[b.priority] - priorityMap[a.priority];
  });
  
  return sortedTasks[0] || null;
}

/**
 * Log task actions to a file
 */
function logTaskAction(taskId, action, taskData = null) {
  ensureStorageDirectories();
  
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    taskId,
    action,
    taskData
  };
  
  const logFile = path.join(TASK_LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
  
  try {
    let logs = [];
    if (fs.existsSync(logFile)) {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
    
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Error logging task action:', error.message);
  }
}

/**
 * Format tasks for display (similar to the simulated output)
 */
function formatTasksForDisplay(tasks) {
  return tasks.map(task => {
    // Convert status to display format
    let statusDisplay = '[todo]';
    if (task.status === 'in-progress') {statusDisplay = '[in-progress]';}
    if (task.status === 'completed') {statusDisplay = '[completed]';}
    if (task.status === 'blocked') {statusDisplay = '[blocked]';}
    
    // Format the task similar to the simulation output
    return `${task.id} - ${task.title} - ${statusDisplay} - Priority: ${task.priority}`;
  }).join('\n');
}

/**
 * Command handler - processes taskmaster commands and returns results
 */
function executeCommand(args) {
  const parts = args.trim().split(' ');
  const command = parts[0];
  
  try {
    switch (command) {
      case 'list':
        const tasks = getAllTasks();
        return formatTasksForDisplay(tasks);
      
      case 'next':
        // Extract phase if provided
        const phaseArg = parts.find(part => part.startsWith('phase='));
        const phase = phaseArg ? phaseArg.split('=')[1] : null;
        
        const nextTask = getNextTask(phase);
        return nextTask ? JSON.stringify(nextTask) : JSON.stringify({ error: 'No tasks available' });
      
      case 'current':
        const currentTask = getCurrentTask();
        return currentTask ? JSON.stringify(currentTask) : JSON.stringify({ error: 'No task in progress' });
      
      case 'deps':
        const taskId = parts[1];
        if (!taskId) {return JSON.stringify({ error: 'Task ID required' });}
        
        const subtasks = getSubtasks(taskId);
        return JSON.stringify(subtasks);
      
      case 'create':
        // Parse arguments: create name="Task name" description="Description" parent=123 phase=implementation
        const title = extractArgValue(args, 'name');
        const description = extractArgValue(args, 'description') || '';
        const parentId = extractArgValue(args, 'parent');
        const createPhase = extractArgValue(args, 'phase');
        
        if (!title) {return JSON.stringify({ error: 'Task name required' });}
        
        const newTask = createTask({
          title,
          description,
          parentId,
          phase: createPhase
        });
        
        return JSON.stringify(newTask);
      
      case 'update':
        // Parse arguments: update id=123 status=completed
        const updateId = extractArgValue(args, 'id');
        if (!updateId) {return JSON.stringify({ error: 'Task ID required' });}
        
        const updates = {};
        const possibleUpdates = ['status', 'priority', 'title', 'description', 'phase'];
        
        possibleUpdates.forEach(field => {
          const value = extractArgValue(args, field);
          if (value !== null) {updates[field] = value;}
        });
        
        const updatedTask = updateTask(updateId, updates);
        return updatedTask ? JSON.stringify(updatedTask) : JSON.stringify({ error: 'Update failed' });
      
      case 'delete':
        const deleteId = extractArgValue(args, 'id');
        if (!deleteId) {return JSON.stringify({ error: 'Task ID required' });}
        
        const deleted = deleteTask(deleteId);
        return JSON.stringify({ success: deleted });
      
      default:
        return JSON.stringify({ error: `Unknown command: ${command}` });
    }
  } catch (error) {
    console.error('Error executing command:', error);
    return JSON.stringify({ error: error.message });
  }
}

/**
 * Extract value from command arguments
 * Example: extract 'name' from 'create name="Task name" description="Description"'
 */
function extractArgValue(args, key) {
  const regex = new RegExp(`${key}=(?:"([^"]+)"|([^\\s"]+))`);
  const match = args.match(regex);
  return match ? (match[1] || match[2]) : null;
}

// Export the API
module.exports = {
  createTask,
  updateTask,
  deleteTask,
  getAllTasks,
  getTaskById,
  getSubtasks,
  getCurrentTask,
  getNextTask,
  executeCommand,
  loadTasks,
  saveTasks
}; 