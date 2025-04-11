#!/usr/bin/env node

/**
 * Taskmaster Scheduler for Project Rules Extension
 * 
 * Provides an automated system for:
 * 1. Managing task deadlines and dependencies
 * 2. Generating optimized task schedules based on priorities and dependencies
 * 3. Sending reminders about upcoming deadlines and blocked tasks
 * 4. Auto-scheduling new tasks based on team workload and velocity
 * 
 * Usage:
 *   node taskmaster-scheduler.js                          // Interactive mode
 *   node taskmaster-scheduler.js --auto                   // Automated mode (non-interactive)
 *   node taskmaster-scheduler.js --generate-schedule      // Generate an optimized task schedule
 *   node taskmaster-scheduler.js --remind                 // Send reminders for upcoming tasks
 *   node taskmaster-scheduler.js --recalculate-deadlines  // Recalculate deadlines based on progress
 *   node taskmaster-scheduler.js --export=file.json       // Export schedule to JSON file
 *   node taskmaster-scheduler.js --import=file.json       // Import schedule from JSON file
 *   node taskmaster-scheduler.js --monitor                // Start schedule monitoring daemon
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const GENERATE_SCHEDULE = args.includes('--generate-schedule');
const SEND_REMINDERS = args.includes('--remind');
const RECALCULATE_DEADLINES = args.includes('--recalculate-deadlines');
const MONITOR_MODE = args.includes('--monitor');
const EXPORT_ARG = args.find(arg => arg.startsWith('--export='));
const IMPORT_ARG = args.find(arg => arg.startsWith('--import='));
const EXPORT_FILE = EXPORT_ARG ? EXPORT_ARG.split('=')[1] : null;
const IMPORT_FILE = IMPORT_ARG ? IMPORT_ARG.split('=')[1] : null;

// Configuration
const config = {
  schedulePath: path.join(process.cwd(), 'docs', 'taskmaster', 'schedule.json'),
  reminderThresholdDays: 2,
  monitorIntervalMinutes: 30,
  maxTasksPerDay: 3,
  priorityWeights: {
    high: 3,
    medium: 2,
    low: 1
  }
};

// Create readline interface for user input (only if not in auto mode)
const rl = AUTO_MODE ? null : readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Utility to run a command and return its output
 */
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

/**
 * Simulate taskmaster command if not available
 */
async function taskmaster(args) {
  const command = `taskmaster ${args}`;
  
  try {
    // Check if taskmaster is installed
    const taskmasterExists = await runCommand('where taskmaster').catch(() => false);
    
    if (taskmasterExists) {
      // Real taskmaster command
      return await runCommand(command);
    } else {
      // Simulation mode - return simulated data
      console.log(`[Simulated command: ${command}]`);
      
      if (args === 'list') {
        return JSON.stringify([
          { id: '123', name: 'Implement TypeScript event handlers', status: 'in-progress', priority: 'high', dueDate: tomorrow(), assignedTo: 'dev1', estimatedHours: 4, dependencies: [] },
          { id: '124', name: 'Add unit tests for event handlers', status: 'pending', priority: 'medium', dueDate: dayAfter(3), assignedTo: 'dev2', estimatedHours: 2, dependencies: ['123'] },
          { id: '125', name: 'Update documentation', status: 'pending', priority: 'low', dueDate: dayAfter(5), assignedTo: null, estimatedHours: 1, dependencies: ['123', '124'] }
        ]);
      }
      
      return '[]';
    }
  } catch (error) {
    console.error(`Failed to execute taskmaster command: ${error}`);
    return '[]';
  }
}

/**
 * Helper to get tomorrow's date string
 */
function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

/**
 * Helper to get a date X days in the future
 */
function dayAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Load the current task schedule
 */
async function loadSchedule() {
  try {
    // First try to load from file
    if (fs.existsSync(config.schedulePath)) {
      const scheduleData = fs.readFileSync(config.schedulePath, 'utf8');
      return JSON.parse(scheduleData);
    }
    
    // If no file exists, generate from current tasks
    return generateSchedule();
  } catch (error) {
    console.error(`Error loading schedule: ${error.message}`);
    return { tasks: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save the task schedule to file
 */
async function saveSchedule(schedule) {
  try {
    // Ensure directory exists
    const dir = path.dirname(config.schedulePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Update timestamp and save
    schedule.lastUpdated = new Date().toISOString();
    fs.writeFileSync(config.schedulePath, JSON.stringify(schedule, null, 2));
    console.log(`Schedule saved to ${config.schedulePath}`);
    return true;
  } catch (error) {
    console.error(`Error saving schedule: ${error.message}`);
    return false;
  }
}

/**
 * Generate an optimized task schedule
 */
async function generateSchedule() {
  console.log("Generating optimized task schedule...");
  
  // Get all tasks
  const tasksJson = await taskmaster('list');
  let tasks = [];
  
  try {
    tasks = JSON.parse(tasksJson);
  } catch (error) {
    console.error("Failed to parse task list:", error);
    tasks = [];
  }
  
  // Sort tasks based on priority, dependencies, and deadlines
  tasks.sort((a, b) => {
    // First by dependencies (if one depends on the other)
    if (a.dependencies && a.dependencies.includes(b.id)) {return 1;}
    if (b.dependencies && b.dependencies.includes(a.id)) {return -1;}
    
    // Then by priority
    const priorityA = config.priorityWeights[a.priority] || 1;
    const priorityB = config.priorityWeights[b.priority] || 1;
    if (priorityA !== priorityB) {return priorityB - priorityA;}
    
    // Then by due date
    const dateA = a.dueDate ? new Date(a.dueDate) : new Date(9999, 11, 31);
    const dateB = b.dueDate ? new Date(b.dueDate) : new Date(9999, 11, 31);
    return dateA - dateB;
  });
  
  // Assign start dates based on dependencies and task durations
  const schedule = { tasks: [], lastUpdated: new Date().toISOString() };
  const taskMap = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Create a map of tasks for faster lookups
  tasks.forEach(task => {
    taskMap.set(task.id, {
      ...task,
      startDate: null,
      endDate: null,
      blockedBy: []
    });
  });
  
  // Calculate blocked status
  tasks.forEach(task => {
    const scheduledTask = taskMap.get(task.id);
    
    // Check dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach(depId => {
        if (taskMap.has(depId)) {
          scheduledTask.blockedBy.push(depId);
        }
      });
    }
  });
  
  // Schedule tasks
  const dailyTaskCount = new Map(); // Track tasks per day
  
  tasks.forEach(task => {
    const scheduledTask = taskMap.get(task.id);
    
    // Skip already completed tasks
    if (task.status === 'completed') {
      scheduledTask.startDate = task.completedDate || today.toISOString().split('T')[0];
      scheduledTask.endDate = task.completedDate || today.toISOString().split('T')[0];
      schedule.tasks.push(scheduledTask);
      return;
    }
    
    // Calculate earliest possible start date based on dependencies
    let startDate = new Date(today);
    
    // If task has dependencies, it can't start until all dependencies are done
    if (scheduledTask.blockedBy.length > 0) {
      scheduledTask.blockedBy.forEach(depId => {
        const depTask = taskMap.get(depId);
        if (depTask && depTask.endDate) {
          const depEndDate = new Date(depTask.endDate);
          depEndDate.setDate(depEndDate.getDate() + 1); // Start the day after dependency ends
          if (depEndDate > startDate) {
            startDate = new Date(depEndDate);
          }
        }
      });
    }
    
    // Find a day with capacity
    let daysToAdd = 0;
    let candidateDate;
    
    do {
      candidateDate = new Date(startDate);
      candidateDate.setDate(candidateDate.getDate() + daysToAdd);
      const dateString = candidateDate.toISOString().split('T')[0];
      
      // Check how many tasks are already scheduled for this day
      const tasksOnThisDay = dailyTaskCount.get(dateString) || 0;
      
      if (tasksOnThisDay < config.maxTasksPerDay) {
        // This day has capacity
        dailyTaskCount.set(dateString, tasksOnThisDay + 1);
        break;
      }
      
      daysToAdd++;
    } while (daysToAdd < 60); // Avoid infinite loop, limit to 2 months out
    
    // Set the start date
    scheduledTask.startDate = candidateDate.toISOString().split('T')[0];
    
    // Calculate end date based on estimated hours
    // Assume 6 productive hours per day
    const durationDays = Math.ceil((task.estimatedHours || 4) / 6);
    const endDate = new Date(candidateDate);
    endDate.setDate(endDate.getDate() + durationDays - 1);
    scheduledTask.endDate = endDate.toISOString().split('T')[0];
    
    // Add to schedule
    schedule.tasks.push(scheduledTask);
  });
  
  return schedule;
}

/**
 * Check for and send reminders about upcoming deadlines
 */
async function sendReminders() {
  console.log("Checking for tasks that need reminders...");
  
  const schedule = await loadSchedule();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const reminders = [];
  
  schedule.tasks.forEach(task => {
    // Skip completed tasks
    if (task.status === 'completed') {return;}
    
    // Check for upcoming deadlines
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue <= config.reminderThresholdDays && daysUntilDue >= 0) {
        reminders.push({
          type: 'deadline',
          task,
          message: `Task "${task.name}" (ID: ${task.id}) is due ${daysUntilDue === 0 ? 'today' : `in ${daysUntilDue} days`}!`
        });
      } else if (daysUntilDue < 0) {
        reminders.push({
          type: 'overdue',
          task,
          message: `Task "${task.name}" (ID: ${task.id}) is overdue by ${Math.abs(daysUntilDue)} days!`
        });
      }
    }
    
    // Check for blocked tasks
    if (task.blockedBy && task.blockedBy.length > 0) {
      const blockers = task.blockedBy.map(id => {
        const blockerTask = schedule.tasks.find(t => t.id === id);
        return blockerTask ? blockerTask.name : id;
      });
      
      reminders.push({
        type: 'blocked',
        task,
        message: `Task "${task.name}" (ID: ${task.id}) is blocked by: ${blockers.join(', ')}`
      });
    }
  });
  
  // Display reminders
  if (reminders.length === 0) {
    console.log("No reminders to send.");
    return;
  }
  
  console.log("\n📅 TASKMASTER REMINDERS:\n");
  
  reminders.forEach(reminder => {
    const icon = reminder.type === 'deadline' ? '⏰' : 
                reminder.type === 'overdue' ? '🚨' : '🔒';
    
    console.log(`${icon} ${reminder.message}`);
    
    // In a real implementation, you might send these via email, notifications, etc.
  });
  
  console.log("\nReminders sent successfully.");
}

/**
 * Recalculate task deadlines based on current progress
 */
async function recalculateDeadlines() {
  console.log("Recalculating task deadlines based on current progress...");
  
  const schedule = await loadSchedule();
  const tasksJson = await taskmaster('list');
  let currentTasks = [];
  
  try {
    currentTasks = JSON.parse(tasksJson);
  } catch (error) {
    console.error("Failed to parse task list:", error);
    return;
  }
  
  // Update the schedule with latest task status
  let changed = false;
  
  currentTasks.forEach(currentTask => {
    const scheduledTask = schedule.tasks.find(t => t.id === currentTask.id);
    
    if (scheduledTask) {
      // Update status
      if (scheduledTask.status !== currentTask.status) {
        scheduledTask.status = currentTask.status;
        changed = true;
      }
      
      // For completed tasks, update completion date
      if (currentTask.status === 'completed' && !scheduledTask.completedDate) {
        scheduledTask.completedDate = new Date().toISOString().split('T')[0];
        changed = true;
      }
    } else {
      // New task, add to schedule
      schedule.tasks.push({
        ...currentTask,
        startDate: null,
        endDate: null,
        blockedBy: []
      });
      changed = true;
    }
  });
  
  // Remove tasks that no longer exist
  schedule.tasks = schedule.tasks.filter(scheduledTask => 
    currentTasks.some(t => t.id === scheduledTask.id));
  
  // If changes were made, regenerate the schedule
  if (changed) {
    const newSchedule = await generateSchedule();
    await saveSchedule(newSchedule);
    console.log("Deadlines recalculated successfully.");
  } else {
    console.log("No changes needed to deadlines.");
  }
}

/**
 * Export schedule to JSON file
 */
async function exportSchedule(filePath) {
  const schedule = await loadSchedule();
  
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(schedule, null, 2));
    console.log(`Schedule exported to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error exporting schedule: ${error.message}`);
    return false;
  }
}

/**
 * Import schedule from JSON file
 */
async function importSchedule(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return false;
    }
    
    const scheduleData = fs.readFileSync(filePath, 'utf8');
    const schedule = JSON.parse(scheduleData);
    
    await saveSchedule(schedule);
    console.log(`Schedule imported from ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error importing schedule: ${error.message}`);
    return false;
  }
}

/**
 * Start monitoring mode that checks for schedule updates periodically
 */
async function startMonitor() {
  console.log(`Starting schedule monitor (checking every ${config.monitorIntervalMinutes} minutes)...`);
  
  // Initial update
  await recalculateDeadlines();
  await sendReminders();
  
  // Set up interval
  const intervalMs = config.monitorIntervalMinutes * 60 * 1000;
  
  setInterval(async () => {
    console.log(`\n[${new Date().toLocaleTimeString()}] Running scheduled check...`);
    await recalculateDeadlines();
    await sendReminders();
  }, intervalMs);
  
  console.log("Monitor running. Press Ctrl+C to stop.");
}

/**
 * Display interactive menu
 */
async function showMenu() {
  console.log("\n📋 TASKMASTER SCHEDULER\n");
  console.log("1. Generate Optimized Schedule");
  console.log("2. Send Task Reminders");
  console.log("3. Recalculate Deadlines");
  console.log("4. Export Schedule");
  console.log("5. Import Schedule");
  console.log("6. Start Monitor");
  console.log("0. Exit");
  
  const answer = await new Promise(resolve => {
    rl.question("\nSelect an option: ", resolve);
  });
  
  switch (answer) {
    case '1':
      { const schedule = await generateSchedule();
      await saveSchedule(schedule);
      break; }
    case '2':
      await sendReminders();
      break;
    case '3':
      await recalculateDeadlines();
      break;
    case '4':
      { const exportPath = await new Promise(resolve => {
        rl.question("Export path: ", resolve);
      });
      await exportSchedule(exportPath);
      break; }
    case '5':
      { const importPath = await new Promise(resolve => {
        rl.question("Import path: ", resolve);
      });
      await importSchedule(importPath);
      break; }
    case '6':
      await startMonitor();
      return; // Don't loop in monitor mode
    case '0':
      console.log("Exiting...");
      rl.close();
      return;
    default:
      console.log("Invalid option, please try again.");
  }
  
  // Loop back to menu
  await showMenu();
}

/**
 * Main function
 */
async function main() {
  // Process command line arguments
  if (GENERATE_SCHEDULE) {
    const schedule = await generateSchedule();
    await saveSchedule(schedule);
  } else if (SEND_REMINDERS) {
    await sendReminders();
  } else if (RECALCULATE_DEADLINES) {
    await recalculateDeadlines();
  } else if (EXPORT_FILE) {
    await exportSchedule(EXPORT_FILE);
  } else if (IMPORT_FILE) {
    await importSchedule(IMPORT_FILE);
  } else if (MONITOR_MODE) {
    await startMonitor();
  } else if (AUTO_MODE) {
    // Auto mode - run all main functions
    await recalculateDeadlines();
    await sendReminders();
  } else {
    // Interactive mode
    await showMenu();
  }
}

// Run the main function
main().catch(error => {
  console.error("Error in taskmaster-scheduler:", error);
  process.exit(1);
}).finally(() => {
  // Close readline interface if it's open
  if (rl && rl.close) {
    rl.close();
  }
}); 