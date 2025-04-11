#!/usr/bin/env node

/**
 * Taskmaster Storage CLI
 * 
 * A simple CLI tool to interact with the taskmaster storage directly.
 * This is useful for shell scripts and GitHub Actions that need to get data
 * in a structured format (JSON).
 * 
 * Usage:
 *   node taskmaster-storage-cli.js <command> [args]
 * 
 * Examples:
 *   node taskmaster-storage-cli.js list
 *   node taskmaster-storage-cli.js list --format
 *   node taskmaster-storage-cli.js list --status=todo --format
 *   node taskmaster-storage-cli.js list --priority=high --format
 *   node taskmaster-storage-cli.js list --phase=implementation --format
 *   node taskmaster-storage-cli.js next
 *   node taskmaster-storage-cli.js current
 *   node taskmaster-storage-cli.js task 123456
 *   node taskmaster-storage-cli.js task 123456 --format
 *   node taskmaster-storage-cli.js ai-analyze [task_id] - Analyze tasks with AI assistant
 */

const taskmasterStorage = require('./taskmaster-storage');
const fs = require('fs').promises;
const path = require('path');

// Check if Gemini integration is available
let geminiAI = null;
try {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiAI = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction: "You are a helpful AI assistant for a task management system called TaskMaster. Analyze tasks and provide insights or suggestions."
    });
  }
} catch (error) {
  // Gemini integration not available, will gracefully handle later
}

// Process command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error('Error: Command required');
  showHelp();
  process.exit(1);
}

// Parse args for options with values
function getArgOption(args, optionName) {
  const option = args.find(arg => arg.startsWith(`--${optionName}=`));
  if (option) {
    return option.split('=')[1];
  }
  return null;
}

// Execute the appropriate command
try {
  switch (command) {
    case 'list': {
      // Get filter options
      const statusFilter = getArgOption(args, 'status');
      const priorityFilter = getArgOption(args, 'priority');
      const phaseFilter = getArgOption(args, 'phase');

      // Check for format flag
      const formatOutput = args.includes('--format');
      const colorizeOutput = args.includes('--colorize');
      let tasks = taskmasterStorage.getAllTasks();

      // Apply filters if provided
      if (statusFilter) {
        tasks = tasks.filter(task => task.status === statusFilter);
      }

      if (priorityFilter) {
        tasks = tasks.filter(task => task.priority === priorityFilter);
      }

      if (phaseFilter) {
        tasks = tasks.filter(task => task.phase === phaseFilter);
      }

      if (formatOutput) {
        displayTasksAsTable(tasks);
      } else if (colorizeOutput) {
        displayColorizedTable(tasks);
      } else {
        console.log(JSON.stringify(tasks));
      }
      break;
    }

    case 'ai-analyze':
      // Analyze tasks with AI
      handleAIAnalyze(args.slice(1));
      break;

    case 'next': {
      // Get the next task to work on
      const phase = args[1]; // Optional phase argument
      const nextTask = taskmasterStorage.getNextTask(phase);
      if (args.includes('--format') && nextTask) {
        displayTaskDetails(nextTask);
      } else if (args.includes('--colorize') && nextTask) {
        displayColorizedTaskDetails(nextTask);
      } else {
        console.log(JSON.stringify(nextTask || { error: 'No tasks available' }));
      }
      break;
    }

    case 'current': {
      // Get the current in-progress task
      const currentTask = taskmasterStorage.getCurrentTask();
      if (args.includes('--format') && currentTask) {
        displayTaskDetails(currentTask);
      } else if (args.includes('--colorize') && currentTask) {
        displayColorizedTaskDetails(currentTask);
      } else {
        console.log(JSON.stringify(currentTask || { error: 'No task in progress' }));
      }
      break;
    }

    case 'subtasks': {
      // Get subtasks for a parent task
      const parentId = args[1];
      if (!parentId) {
        console.error('Error: Parent task ID required');
        process.exit(1);
      }
      const subtasks = taskmasterStorage.getSubtasks(parentId);
      if (args.includes('--format')) {
        displayTasksAsTable(subtasks);
      } else if (args.includes('--colorize')) {
        displayColorizedTable(subtasks);
      } else {
        console.log(JSON.stringify(subtasks));
      }
      break;
    }

    case 'task': {
      // Get a specific task by ID
      const taskId = args[1];
      if (!taskId) {
        console.error('Error: Task ID required');
        process.exit(1);
      }
      const task = taskmasterStorage.getTaskById(taskId);

      if (args.includes('--format') && task) {
        displayTaskDetails(task);
      } else if (args.includes('--colorize') && task) {
        displayColorizedTaskDetails(task);
      } else {
        console.log(JSON.stringify(task || { error: `Task ${taskId} not found` }));
      }
      break;
    }

    case 'create': {
      // Create a new task
      if (args.length < 2) {
        console.error('Error: Task title required');
        process.exit(1);
      }

      const taskData = {
        title: args[1],
        description: args[2] || '',
        priority: args[3] || 'medium',
        parentId: args[4] || null,
        phase: args[5] || null
      };

      const newTask = taskmasterStorage.createTask(taskData);
      console.log(JSON.stringify(newTask));
      break;
    }

    case 'update': {
      // Update a task
      if (args.length < 3) {
        console.error('Error: Task ID and updates required');
        process.exit(1);
      }

      const updateId = args[1];
      const updateField = args[2];
      const updateValue = args[3];

      const updates = {};
      updates[updateField] = updateValue;

      const updatedTask = taskmasterStorage.updateTask(updateId, updates);
      console.log(JSON.stringify(updatedTask || { error: `Update failed for task ${updateId}` }));
      break;
    }

    case 'delete': {
      // Delete a task
      if (args.length < 2) {
        console.error('Error: Task ID required');
        process.exit(1);
      }

      const deleteId = args[1];
      const success = taskmasterStorage.deleteTask(deleteId);
      console.log(JSON.stringify({ success, taskId: deleteId }));
      break;
    }

    case 'help':
      showHelp();
      break;

    default:
      console.error(`Error: Unknown command "${command}"`);
      showHelp();
      process.exit(1);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

/**
 * Handle AI analysis of tasks
 * @param {Array} args - Arguments for AI analysis
 */
async function handleAIAnalyze(args) {
  if (!geminiAI) {
    console.error('Error: Gemini AI integration not available. Please install @google/generative-ai and set GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  try {
    // Check if we're analyzing a specific task or all tasks
    const taskId = args[0];
    let taskData;

    if (taskId) {
      // Analyze specific task
      const task = taskmasterStorage.getTaskById(taskId);
      if (!task) {
        console.error(`Error: Task ${taskId} not found`);
        process.exit(1);
      }
      taskData = task;
    } else {
      // Analyze all tasks
      taskData = taskmasterStorage.getAllTasks();
    }

    // Format the prompt based on task data
    const prompt = formatTaskPrompt(taskData);

    // Call Gemini API
    console.log('Analyzing task(s) with AI assistant...');
    const result = await geminiAI.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Display the result with a nice separator
    const separator = '-'.repeat(80);
    console.log(separator);
    console.log('AI ANALYSIS:');
    console.log(separator);
    console.log(text);
    console.log(separator);

  } catch (error) {
    console.error('AI Analysis Error:', error.message);
    process.exit(1);
  }
}

/**
 * Format task data for AI prompt
 * @param {Object|Array} taskData - Task or tasks to format
 * @returns {string} - Formatted prompt
 */
function formatTaskPrompt(taskData) {
  let prompt = 'Analyze the following task(s) from the TaskMaster system:\n\n';

  if (Array.isArray(taskData)) {
    // Format multiple tasks
    prompt += 'Tasks Overview:\n';
    taskData.forEach(task => {
      prompt += `- ${task.title} (ID: ${task.id}, Status: ${task.status}, Priority: ${task.priority}, Phase: ${task.phase || 'None'})\n`;
    });

    prompt += '\nPlease provide:\n';
    prompt += '1. Overall assessment of task organization\n';
    prompt += '2. Suggestions for task prioritization\n';
    prompt += '3. Recommendations for efficient task completion\n';
  } else {
    // Format single task
    prompt += `Task: ${taskData.title}\n`;
    prompt += `ID: ${taskData.id}\n`;
    prompt += `Status: ${taskData.status}\n`;
    prompt += `Priority: ${taskData.priority}\n`;
    prompt += `Phase: ${taskData.phase || 'None'}\n`;
    prompt += `Description: ${taskData.description || 'No description'}\n`;

    prompt += '\nPlease provide:\n';
    prompt += '1. Analysis of task complexity and scope\n';
    prompt += '2. Suggestions for breaking down the task (if needed)\n';
    prompt += '3. Recommendations for implementation approach\n';
  }

  return prompt;
}

/**
 * Displays tasks in a formatted table
 * @param {Array} tasks - Array of task objects
 */
function displayTasksAsTable(tasks) {
  if (!tasks || tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  // Define column widths
  const columns = {
    id: 10,
    title: 40,
    status: 12,
    priority: 10,
    phase: 15
  };

  // Create header row
  const header = [
    'ID'.padEnd(columns.id),
    'TITLE'.padEnd(columns.title),
    'STATUS'.padEnd(columns.status),
    'PRIORITY'.padEnd(columns.priority),
    'PHASE'.padEnd(columns.phase)
  ].join(' | ');

  // Create separator
  const separator = '-'.repeat(header.length);

  // Print header
  console.log(separator);
  console.log(header);
  console.log(separator);

  // Print each task
  tasks.forEach(task => {
    let title = task.title || '';
    if (title.length > columns.title - 3 && title.length > columns.title) {
      title = title.substring(0, columns.title - 3) + '...';
    }

    const row = [
      (task.id || '').toString().substring(0, columns.id).padEnd(columns.id),
      title.padEnd(columns.title),
      (task.status || '').substring(0, columns.status).padEnd(columns.status),
      (task.priority || '').substring(0, columns.priority).padEnd(columns.priority),
      (task.phase || '').substring(0, columns.phase).padEnd(columns.phase)
    ].join(' | ');

    console.log(row);
  });

  console.log(separator);
  console.log(`${tasks.length} tasks found.`);
}

/**
 * Displays tasks in a colorized table format
 * @param {Array} tasks - Array of task objects
 */
function displayColorizedTable(tasks) {
  if (!tasks || tasks.length === 0) {
    console.log("\x1b[33mNo tasks found.\x1b[0m");
    return;
  }

  // ANSI color codes
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m"
  };

  // Status colors
  const statusColors = {
    'todo': colors.white,
    'in-progress': colors.cyan,
    'completed': colors.green,
    'blocked': colors.red
  };

  // Priority colors
  const priorityColors = {
    'low': colors.dim + colors.white,
    'medium': colors.yellow,
    'high': colors.magenta,
    'critical': colors.bright + colors.red
  };

  // Define column widths
  const columns = {
    id: 10,
    title: 40,
    status: 12,
    priority: 10,
    phase: 15
  };

  // Create header row
  const headerColor = colors.bright + colors.white;
  const header = headerColor + [
    'ID'.padEnd(columns.id),
    'TITLE'.padEnd(columns.title),
    'STATUS'.padEnd(columns.status),
    'PRIORITY'.padEnd(columns.priority),
    'PHASE'.padEnd(columns.phase)
  ].join(' | ') + colors.reset;

  // Calculate total content width (excluding color codes)
  const contentWidth = columns.id + columns.title + columns.status + columns.priority + columns.phase + (5 * 3); // 5 columns, 3 chars for each separator (' | ')

  // Create separator
  const separator = colors.dim + '-'.repeat(contentWidth) + colors.reset;

  // Print header
  console.log(separator);
  console.log(header);
  console.log(separator);

  // Print each task
  tasks.forEach(task => {
    let title = task.title || '';
    if (title.length > columns.title - 3 && title.length > columns.title) {
      title = title.substring(0, columns.title - 3) + '...';
    }

    const statusColor = statusColors[task.status] || colors.white;
    const priorityColor = priorityColors[task.priority] || colors.white;
    const idColor = colors.bright + colors.blue;
    const phaseColor = colors.green;

    const row = [
      idColor + (task.id || '').toString().substring(0, columns.id).padEnd(columns.id) + colors.reset,
      colors.bright + title.padEnd(columns.title) + colors.reset,
      statusColor + (task.status || '').substring(0, columns.status).padEnd(columns.status) + colors.reset,
      priorityColor + (task.priority || '').substring(0, columns.priority).padEnd(columns.priority) + colors.reset,
      phaseColor + (task.phase || '').substring(0, columns.phase).padEnd(columns.phase) + colors.reset
    ].join(' | ');

    console.log(row);
  });

  console.log(separator);
  console.log(colors.bright + colors.yellow + `${tasks.length} tasks found.` + colors.reset);
}

/**
 * Displays detailed information about a single task
 * @param {Object} task - Task object
 */
function displayTaskDetails(task) {
  if (!task) {
    console.log("Task not found.");
    return;
  }

  const width = 80;
  const separator = '='.repeat(width);

  console.log(separator);

  // Title and ID header
  console.log(`TASK: ${task.title} (ID: ${task.id})`);
  console.log(separator);

  // Status information
  console.log(`STATUS    : ${task.status || 'Not set'}`);
  console.log(`PRIORITY  : ${task.priority || 'Not set'}`);
  console.log(`PHASE     : ${task.phase || 'Not set'}`);

  // Dates
  console.log(`CREATED   : ${formatDate(task.createdAt)}`);
  console.log(`UPDATED   : ${formatDate(task.updatedAt)}`);

  if (task.completedAt) {
    console.log(`COMPLETED : ${formatDate(task.completedAt)}`);
  }

  console.log(separator);

  // Description
  console.log('DESCRIPTION:');
  console.log();
  if (task.description && task.description.trim().length > 0) {
    // Word wrap the description
    const words = task.description.split(' ');
    let line = '';

    words.forEach(word => {
      if ((line + ' ' + word).length > width) {
        console.log(line);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    });

    if (line) {
      console.log(line);
    }
  } else {
    console.log('No description provided.');
  }

  console.log();
  console.log(separator);

  // Parent task reference
  if (task.parentId) {
    console.log(`This is a subtask of task: ${task.parentId}`);
    console.log(separator);
  }
}

/**
 * Displays detailed information about a single task with colorization
 * @param {Object} task - Task object
 */
function displayColorizedTaskDetails(task) {
  if (!task) {
    console.log("\x1b[33mTask not found.\x1b[0m");
    return;
  }

  // ANSI color codes
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m"
  };

  // Status colors
  const statusColors = {
    'todo': colors.white,
    'in-progress': colors.cyan,
    'completed': colors.green,
    'blocked': colors.red
  };

  // Priority colors
  const priorityColors = {
    'low': colors.dim + colors.white,
    'medium': colors.yellow,
    'high': colors.magenta,
    'critical': colors.bright + colors.red
  };

  const width = 80;
  const separator = colors.dim + '='.repeat(width) + colors.reset;

  console.log(separator);

  // Title and ID header
  console.log(colors.bright + colors.cyan + `TASK: ${task.title}` + colors.reset +
    colors.dim + ` (ID: ${task.id})` + colors.reset);
  console.log(separator);

  // Status information
  const statusColor = statusColors[task.status] || colors.white;
  const priorityColor = priorityColors[task.priority] || colors.white;
  const phaseColor = colors.green;

  console.log(colors.bright + `STATUS    : ` + colors.reset +
    statusColor + `${task.status || 'Not set'}` + colors.reset);
  console.log(colors.bright + `PRIORITY  : ` + colors.reset +
    priorityColor + `${task.priority || 'Not set'}` + colors.reset);
  console.log(colors.bright + `PHASE     : ` + colors.reset +
    phaseColor + `${task.phase || 'Not set'}` + colors.reset);

  // Dates
  console.log(colors.bright + `CREATED   : ` + colors.reset +
    colors.dim + `${formatDate(task.createdAt)}` + colors.reset);
  console.log(colors.bright + `UPDATED   : ` + colors.reset +
    colors.dim + `${formatDate(task.updatedAt)}` + colors.reset);

  if (task.completedAt) {
    console.log(colors.bright + `COMPLETED : ` + colors.reset +
      colors.green + `${formatDate(task.completedAt)}` + colors.reset);
  }

  console.log(separator);

  // Description
  console.log(colors.bright + colors.underscore + 'DESCRIPTION:' + colors.reset);
  console.log();
  if (task.description && task.description.trim().length > 0) {
    // Word wrap the description
    const words = task.description.split(' ');
    let line = '';

    words.forEach(word => {
      if ((line + ' ' + word).length > width) {
        console.log(colors.bright + line + colors.reset);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    });

    if (line) {
      console.log(colors.bright + line + colors.reset);
    }
  } else {
    console.log(colors.dim + 'No description provided.' + colors.reset);
  }

  console.log();
  console.log(separator);

  // Parent task reference
  if (task.parentId) {
    console.log(colors.yellow + `This is a subtask of task: ` +
      colors.bright + colors.blue + task.parentId + colors.reset);
    console.log(separator);
  }
}

/**
 * Formats a date string to a readable format
 * @param {string} dateStr - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateStr) {
  if (!dateStr) { return 'Not set'; }

  const date = new Date(dateStr);
  return date.toLocaleString();
}

function showHelp() {
  console.log(`
Taskmaster Storage CLI

Usage:
  node taskmaster-storage-cli.js <command> [args]

Commands:
  list                         List all tasks
  list --format                List all tasks in a formatted table
  list --colorize              List all tasks in a colorized table with ANSI colors
  list --status=<status>       Filter tasks by status (todo, in-progress, completed)
  list --priority=<priority>   Filter tasks by priority (low, medium, high, critical)
  list --phase=<phase>         Filter tasks by phase (planning, implementation, etc.)
  next [phase]                 Get next task to work on (optional phase filter)
  next [phase] --format        Get next task with formatted output
  next [phase] --colorize      Get next task with colorized output
  current                      Get current in-progress task
  current --format             Get current task with formatted output
  current --colorize           Get current task with colorized output
  subtasks <parentId>          Get subtasks for a parent task
  subtasks <parentId> --format Get subtasks with formatted output
  subtasks <parentId> --colorize Get subtasks with colorized output
  task <taskId>                Get a specific task by ID
  task <taskId> --format       Get a specific task with formatted output
  task <taskId> --colorize     Get a specific task with colorized output
  create <title> [desc] [prio] [parentId] [phase]  Create a new task
  update <taskId> <field> <value>                  Update a task
  delete <taskId>              Delete a task
  ai-analyze [taskId]          Analyze tasks with AI assistant
  help                         Show this help message
  `);
} 