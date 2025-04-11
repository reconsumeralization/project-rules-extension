/**
 * Taskmaster Workflow Script for Project Rules Extension
 * 
 * Implemented as part of Task #123: TypeScript event handlers compatibility
 * This script provides a JavaScript implementation of the Taskmaster workflow
 * for better cross-platform compatibility.
 * 
 * Usage:
 *   node taskmaster-workflow.js             // Interactive mode
 *   node taskmaster-workflow.js --auto      // Automated mode (non-interactive)
 *   node taskmaster-workflow.js --task=123  // Work on specific task ID
 *   node taskmaster-workflow.js --auto --complete-current // Auto-complete current task
 */

const readline = require('readline');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const COMPLETE_CURRENT = args.includes('--complete-current');
const SHOW_HELP = args.includes('--help');
const SHOW_TASKS = args.includes('--task');
const SHOW_DASHBOARD = args.includes('--dashboard');
const TASK_ARG = args.find(arg => arg.startsWith('--task='));
const SPECIFIC_TASK_ID = TASK_ARG ? TASK_ARG.split('=')[1] : null;

// Create readline interface for user input (only if not in auto mode)
const rl = AUTO_MODE ? null : readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Use real task storage instead of simulation
const taskmasterStorage = require('./taskmaster-storage');

// Utility to run a command and return its output
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.warn(`Command warning: ${stderr}`);
      }
      resolve(stdout.trim());
    });
  });
}

// Replace the simulated taskmaster function
async function taskmaster(args) {
  const command = `taskmaster ${args}`;
  
  try {
    // Check if taskmaster is installed as a global command
    const taskmasterExists = await runCommand('where taskmaster').catch(() => false);
    
    if (taskmasterExists) {
      // Real global taskmaster command
      return await runCommand(command);
    } else {
      // Use our local implementation
      console.log(`[Running command: ${command}]`);
      return taskmasterStorage.executeCommand(args);
    }
  } catch (error) {
    console.error(`Failed to execute taskmaster command: ${error}`);
    return null;
  }
}

// Helper for automated confirmation in auto mode
function autoConfirm(question, defaultAnswer = true) {
  if (AUTO_MODE) {
    console.log(`${question} (Auto: ${defaultAnswer ? 'y' : 'n'})`);
    return Promise.resolve(defaultAnswer ? 'y' : 'n');
  }
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase());
    });
  });
}

// Helper for automated text input in auto mode
function autoInput(question, defaultValue = '') {
  if (AUTO_MODE) {
    console.log(`${question} (Auto: "${defaultValue}")`);
    return Promise.resolve(defaultValue);
  }
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Add a new function for breaking down tasks
async function expandTask(taskId) {
  console.log(`\nBreaking down task #${taskId} into smaller tasks...`);
  
  // Collect subtasks
  const subtasks = [];
  let addingSubtasks = true;
  let subtaskCounter = 1;
  
  if (AUTO_MODE) {
    // In auto mode, create some default subtasks
    subtasks.push({
      name: `Prepare test environment for task #${taskId}`,
      description: 'Set up necessary mocks and test utilities'
    });
    subtasks.push({
      name: `Implement core functionality for task #${taskId}`,
      description: 'Develop the main features required by this task'
    });
    subtasks.push({
      name: `Documentation for task #${taskId}`,
      description: 'Update README and add inline comments'
    });
    addingSubtasks = false;
  }
  
  while (addingSubtasks) {
    const subtaskName = await autoInput(`Enter name for subtask #${subtaskCounter} (or 'done' to finish): `);
    
    if (subtaskName.toLowerCase() === 'done') {
      addingSubtasks = false;
      break;
    }
    
    const subtaskDescription = await autoInput(`Enter description for "${subtaskName}": `);
    
    subtasks.push({
      name: subtaskName,
      description: subtaskDescription
    });
    
    subtaskCounter++;
  }
  
  if (subtasks.length === 0) {
    console.log("No subtasks created. Task expansion cancelled.");
    return;
  }
  
  // Display the subtasks
  console.log("\nCreating the following subtasks:");
  subtasks.forEach((subtask, index) => {
    console.log(`${index + 1}. ${subtask.name}`);
    console.log(`   Description: ${subtask.description}`);
  });
  
  // Create subtasks using real implementation
  const createdSubtasks = [];
  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    
    // Create the subtask using our storage
    const command = `create name="${subtask.name}" description="${subtask.description}" parent=${taskId}`;
    console.log(`\n[Running command: taskmaster ${command}]`);
    
    const result = taskmasterStorage.executeCommand(command);
    let createdTask;
    
    try {
      createdTask = JSON.parse(result);
      console.log(`Created subtask #${createdTask.id}: ${createdTask.title}`);
      createdSubtasks.push(createdTask);
    } catch (e) {
      console.error(`Error creating subtask: ${e.message}`);
    }
  }
  
  // Update the parent task
  const updateCommand = `update id=${taskId} status=expanded`;
  console.log(`\n[Running command: taskmaster ${updateCommand}]`);
  taskmasterStorage.executeCommand(updateCommand);
  console.log(`Updated task #${taskId} status to 'expanded'`);
  
  return createdSubtasks.length;
}

// Add a function to display a visual task dashboard
async function displayTaskDashboard() {
  console.log('\n📊 TASKMASTER DASHBOARD\n');
  
  // Get all tasks for dashboard
  const tasksOutput = await taskmaster('list');
  const taskLines = tasksOutput.split('\n').filter(line => line.trim());
  
  // Calculate metrics
  const tasks = taskmasterStorage.getAllTasks();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;
  const blockedTasks = tasks.filter(task => task.status === 'blocked').length;
  const pendingTasks = tasks.filter(task => task.status === 'todo').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Display metrics
  console.log(`📈 METRICS:`);
  console.log(`  Total Tasks: ${totalTasks}`);
  console.log(`  Completed: ${completedTasks}`);
  console.log(`  In Progress: ${inProgressTasks}`);
  console.log(`  Blocked: ${blockedTasks}`);
  console.log(`  Pending: ${pendingTasks}`);
  console.log(`  Completion Rate: ${completionRate}%\n`);
  
  // Get current task
  const currentTask = await taskmaster('current');
  let currentTaskObj;
  try {
    currentTaskObj = JSON.parse(currentTask);
    if (currentTaskObj && !currentTaskObj.error) {
      console.log(`  Current Focus: #${currentTaskObj.id} - ${currentTaskObj.title}\n`);
    }
  } catch (e) {
    // No current task or error parsing
  }
  
  // Display task table header
  console.log('📋 CURRENT TASKS:');
  console.log('  ID     | Task Name                      | Status     | Priority ');
  console.log('  -------+--------------------------------+------------+----------');
  
  // Display task rows
  const sortedTasks = tasks.sort((a, b) => {
    // First sort by status
    const statusOrder = { 'in-progress': 0, 'todo': 1, 'blocked': 2, 'completed': 3 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) {return statusDiff;}
    
    // Then by priority
    const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  sortedTasks.forEach(task => {
    const id = task.id.padEnd(7);
    const name = task.title.substring(0, 30).padEnd(30);
    const status = getStatusDisplay(task.status);
    const priority = getPriorityDisplay(task.priority);
    
    console.log(`  ${id} | ${name} | ${status} | ${priority}`);
  });
  
  console.log('\n');
}

// Helper functions for dashboard display
function getStatusDisplay(status) {
  switch (status) {
    case 'completed':
      return '✅ Completed'.padEnd(10);
    case 'in-progress':
      return '🔄 Active  '.padEnd(10);
    case 'blocked':
      return '🚫 Blocked '.padEnd(10);
    default:
      return '⏳ Pending '.padEnd(10);
  }
}

function getPriorityDisplay(priority) {
  switch (priority) {
    case 'critical':
      return '🔴 Critical'.padEnd(10);
    case 'high':
      return '🟠 High    '.padEnd(10);
    case 'medium':
      return '🟡 Medium  '.padEnd(10);
    default:
      return '🟢 Low     '.padEnd(10);
  }
}

// Display help message
if (SHOW_HELP) {
  console.log('\n🔍 Taskmaster Workflow Help:');
  console.log('  --auto             Run in automatic mode');
  console.log('  --complete-current Mark current task as complete and move to next');
  console.log('  --task             Display task information');
  console.log('  --dashboard        Display task dashboard visualization');
  console.log('  --help             Show this help message\n');
  process.exit(0);
}

// Main execution
if (SHOW_TASKS) {
  // Display tasks
  displayTaskDashboard();
} else if (SHOW_DASHBOARD) {
  // Display dashboard
  displayTaskDashboard();
} else if (AUTO_MODE) {
  // Auto mode
  runAutoMode();
} else {
  // Interactive mode
  runInteractiveMode();
}

// Automated workflow function
async function runAutoMode() {
  console.log("\n🤖 Running in automated mode...");
  await workflowMain();
}

// Interactive workflow function
async function runInteractiveMode() {
  console.log("\n👤 Running in interactive mode...");
  await workflowMain();
}

// Main workflow function
async function workflowMain() {
  try {
    // Show dashboard if requested
    if (SHOW_DASHBOARD) {
      await displayTaskDashboard();
      if (AUTO_MODE) {
        process.exit(0);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    // Complete current task mode
    if (COMPLETE_CURRENT) {
      console.log("Running in complete-current mode");
      const currentTaskResponse = await taskmaster('current');
      let currentTaskObj;
      
      try {
        currentTaskObj = JSON.parse(currentTaskResponse);
        
        if (currentTaskObj.error) {
          console.error(`Error: ${currentTaskObj.error}`);
          process.exit(1);
        }
      } catch (e) {
        console.error("Error parsing current task, exiting");
        process.exit(1);
      }
      
      await completeTask(currentTaskObj.id);
      
      if (AUTO_MODE) {
        process.exit(0);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    console.log("Checking current tasks...");
    const tasks = await taskmaster('list');
    console.log(tasks);
    
    // Get next task
    console.log("\nIdentifying next task to work on...");
    const nextTaskResponse = await taskmaster('next');
    let nextTask;
    
    try {
      nextTask = JSON.parse(nextTaskResponse);
      
      if (nextTask.error) {
        console.log("No tasks available. Please create some tasks first.");
        if (AUTO_MODE) {
          process.exit(0);
        } else if (rl) {
          rl.close();
        }
        return;
      }
    } catch (e) {
      console.log("Error parsing task JSON, exiting");
      if (AUTO_MODE) {
        process.exit(1);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    console.log(`Next task: #${nextTask.id} - ${nextTask.title}`);
    
    // Ask user if they want to work on this task
    const answer = await autoConfirm('\nDo you want to work on this task? (y/n): ', true);
    if (answer !== 'y') {
      console.log("Exiting workflow. No task was started.");
      
      if (AUTO_MODE) {
        process.exit(0);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    // Update task to in-progress
    console.log("\nUpdating task status to in-progress...");
    const updateResponse = await taskmaster(`update id=${nextTask.id} status=in-progress`);
    
    let updatedTask;
    try {
      updatedTask = JSON.parse(updateResponse);
      if (updatedTask.error) {
        console.error(`Error updating task: ${updatedTask.error}`);
        throw new Error(updatedTask.error);
      }
    } catch (e) {
      console.error(`Failed to update task status: ${e.message}`);
      if (AUTO_MODE) {
        process.exit(1);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    console.log(`Task #${nextTask.id} is now in progress!`);
    
    // Ask if we should expand the task into subtasks
    const expandAnswer = await autoConfirm('\nWould you like to break down this task into subtasks? (y/n): ', false);
    if (expandAnswer === 'y') {
      await expandTask(nextTask.id);
    }
    
    // Final message
    console.log(`\nTask workflow complete. Working on: #${nextTask.id} - ${nextTask.title}`);
    
    if (AUTO_MODE) {
      process.exit(0);
    } else if (rl) {
      rl.close();
    }
  } catch (error) {
    console.error(`Workflow error: ${error.message}`);
    if (AUTO_MODE) {
      process.exit(1);
    } else if (rl) {
      rl.close();
    }
  }
}

// Complete the task and show next task
async function completeTask(taskId) {
  console.log(`\nCompleting task #${taskId}...`);
  
  // Get the task
  const taskResponse = await taskmaster(`update id=${taskId} status=completed`);
  let task;
  
  try {
    task = JSON.parse(taskResponse);
    if (task.error) {
      console.error(`Error completing task: ${task.error}`);
      return false;
    }
  } catch (e) {
    console.error(`Error parsing task response: ${e.message}`);
    return false;
  }
  
  console.log(`Task #${taskId} - "${task.title}" marked as completed!`);
  return true;
}

// Run the workflow
workflowMain(); 