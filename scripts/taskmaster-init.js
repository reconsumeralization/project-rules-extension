/**
 * Taskmaster Initialization Script
 * 
 * This script initializes the Taskmaster system with sample tasks for testing.
 * It's useful for getting started with a fresh environment or for demo purposes.
 */

const taskmasterStorage = require('./taskmaster-storage');
const fs = require('fs');
const path = require('path');

// Sample tasks for initial setup
const sampleTasks = [
  {
    title: 'Implement TypeScript event handlers',
    description: 'Add TypeScript interface for event handlers to improve type safety and developer experience.',
    priority: 'high',
    phase: 'implementation'
  },
  {
    title: 'Add unit tests for event handlers',
    description: 'Create comprehensive test suite for the newly implemented event handlers.',
    priority: 'medium',
    phase: 'testing'
  },
  {
    title: 'Update documentation',
    description: 'Update README and add inline comments for the new event handler functionality.',
    priority: 'low',
    phase: 'documentation'
  },
  {
    title: 'Setup CI/CD pipeline',
    description: 'Configure GitHub Actions workflow for continuous integration and deployment.',
    priority: 'critical',
    phase: 'devops'
  },
  {
    title: 'Refactor synchronization logic',
    description: 'Improve the rule synchronization mechanism for better performance and reliability.',
    priority: 'high',
    phase: 'implementation'
  }
];

// Sample subtasks (will attach to first task)
const sampleSubtasks = [
  {
    title: 'Define event handler interfaces',
    description: 'Create TypeScript interfaces for different event handler types.',
    priority: 'medium',
    phase: 'implementation'
  },
  {
    title: 'Implement event propagation',
    description: 'Add functionality to propagate events through component hierarchy.',
    priority: 'high',
    phase: 'implementation'
  },
  {
    title: 'Add event cancellation support',
    description: 'Implement the ability to cancel event propagation.',
    priority: 'low',
    phase: 'implementation'
  }
];

// Main initialization function
async function initializeTaskmaster() {
  console.log('🔧 Initializing Taskmaster system...');
  
  // Check if we already have tasks
  const existingTasks = taskmasterStorage.getAllTasks();
  if (existingTasks.length > 0) {
    console.log(`Found ${existingTasks.length} existing tasks.`);
    const shouldReset = await promptYesNo('Do you want to reset and create new sample tasks? (y/n): ');
    
    if (!shouldReset) {
      console.log('Initialization cancelled. Existing tasks preserved.');
      return;
    }
    
    // Reset by deleting tasks file
    const tasksFile = path.join(__dirname, '..', 'data', 'taskmaster', 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      fs.unlinkSync(tasksFile);
      console.log('Existing tasks cleared.');
    }
  }
  
  console.log('\nCreating sample tasks...');
  
  // Create main tasks
  const createdTasks = [];
  for (const task of sampleTasks) {
    const createdTask = taskmasterStorage.createTask(task);
    createdTasks.push(createdTask);
    console.log(`Created task #${createdTask.id}: ${createdTask.title}`);
  }
  
  // Add subtasks to the first task
  console.log('\nCreating sample subtasks for first task...');
  const parentTask = createdTasks[0];
  
  for (const subtask of sampleSubtasks) {
    const createdSubtask = taskmasterStorage.createTask({
      ...subtask,
      parentId: parentTask.id
    });
    console.log(`Created subtask #${createdSubtask.id}: ${createdSubtask.title}`);
  }
  
  // Set first task to in-progress
  console.log('\nSetting first task to in-progress...');
  taskmasterStorage.updateTask(parentTask.id, { status: 'in-progress' });
  
  console.log('\n✅ Taskmaster system initialized successfully!');
  console.log('Run the following command to view tasks:');
  console.log('  node scripts/taskmaster-workflow.js --dashboard');
}

// Helper function for yes/no prompts
function promptYesNo(question) {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question(question, answer => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Run the initialization
initializeTaskmaster().catch(error => {
  console.error('Initialization failed:', error);
}); 