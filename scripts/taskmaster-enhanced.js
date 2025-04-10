/**
 * Enhanced Taskmaster Workflow Script for Project Rules Extension
 * 
 * Provides a comprehensive workflow that:
 * 1. Structures development into phases
 * 2. Automates task breakdown based on requirements
 * 3. Integrates with MCP servers for AI-assisted development
 * 4. Provides progress tracking and visualization
 * 
 * Usage:
 *   node taskmaster-enhanced.js                      // Interactive mode
 *   node taskmaster-enhanced.js --auto               // Automated mode (non-interactive)
 *   node taskmaster-enhanced.js --phase=planning     // Work in a specific development phase
 *   node taskmaster-enhanced.js --analyze-task=123   // AI-driven task breakdown
 *   node taskmaster-enhanced.js --mcp-integrate      // Use MCP servers for task analysis
 *   node taskmaster-enhanced.js --progress-report    // Generate progress visualization
 */

const readline = require('readline');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Parse command-line arguments
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const COMPLETE_CURRENT = args.includes('--complete-current');
const SHOW_HELP = args.includes('--help');
const SHOW_TASKS = args.includes('--task');
const SHOW_DASHBOARD = args.includes('--dashboard');
const TASK_ARG = args.find(arg => arg.startsWith('--task='));
const SPECIFIC_TASK_ID = TASK_ARG ? TASK_ARG.split('=')[1] : null;
const PHASE_ARG = args.find(arg => arg.startsWith('--phase='));
const CURRENT_PHASE = PHASE_ARG ? PHASE_ARG.split('=')[1] : null;
const ANALYZE_TASK_ARG = args.find(arg => arg.startsWith('--analyze-task='));
const ANALYZE_TASK_ID = ANALYZE_TASK_ARG ? ANALYZE_TASK_ARG.split('=')[1] : null;
const MCP_INTEGRATE = args.includes('--mcp-integrate');
const PROGRESS_REPORT = args.includes('--progress-report');
const TRADEOFF_ANALYSIS = args.includes('--tradeoff-analysis');
const TRADEOFF_TASK_ARG = args.find(arg => arg.startsWith('--tradeoff-task='));
const TRADEOFF_TASK_ID = TRADEOFF_TASK_ARG ? TRADEOFF_TASK_ARG.split('=')[1] : null;

// Development phases
const PHASES = {
  PLANNING: 'planning',
  DESIGN: 'design',
  IMPLEMENTATION: 'implementation',
  TESTING: 'testing',
  REVIEW: 'review',
  DEPLOYMENT: 'deployment'
};

// MCP agent types to use for different phases
const MCP_AGENTS = {
  [PHASES.PLANNING]: 'Protocol Validator Agent',
  [PHASES.DESIGN]: 'Protocol Enhancement Agent',
  [PHASES.IMPLEMENTATION]: 'Integration Assistant Agent',
  [PHASES.TESTING]: 'Monitoring & Analytics Agent',
  [PHASES.REVIEW]: 'Protocol Validator Agent',
  [PHASES.DEPLOYMENT]: 'Integration Assistant Agent',
  'tradeoff-analysis': 'Protocol Enhancement Agent' // Agent for tradeoff analysis
};

// Create readline interface for user input (only if not in auto mode)
const rl = AUTO_MODE ? null : readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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

// Simulate taskmaster command if not available
async function taskmaster(args) {
  const command = `taskmaster ${args}`;
  
  try {
    // Check if taskmaster is installed
    const taskmasterExists = await runCommand('where taskmaster').catch(() => false);
    
    if (taskmasterExists) {
      // Real taskmaster command
      return await runCommand(command);
    } else {
      // Simulation mode
      console.log(`[Simulated command: ${command}]`);
      
      // For demo purposes, return simulated data
      if (args === 'list') {
        return '123 - Implement TypeScript event handlers compatibility - [pending] - Priority: High\n' +
               '124 - Add unit tests for event handlers - [pending] - Priority: Medium\n' +
               '125 - Update documentation - [pending] - Priority: Low';
      } else if (args === 'next') {
        return JSON.stringify({
          id: SPECIFIC_TASK_ID || '123',
          name: 'Implement TypeScript event handlers compatibility',
          status: 'pending',
          priority: 'High',
          phase: CURRENT_PHASE || PHASES.IMPLEMENTATION
        });
      } else if (args.startsWith('deps')) {
        return JSON.stringify([
          { id: '122', name: 'Setup project structure', status: 'completed' }
        ]);
      } else if (args.startsWith('current')) {
        return JSON.stringify({
          id: '123',
          name: 'Implement TypeScript event handlers compatibility',
          status: 'in-progress',
          priority: 'High',
          phase: CURRENT_PHASE || PHASES.IMPLEMENTATION
        });
      }
      
      return 'Command executed successfully';
    }
  } catch (error) {
    console.error(`Failed to execute taskmaster command: ${error}`);
    return null;
  }
}

// MCP Server Integration - Connect to MCP Server API
async function connectToMcpServer() {
  console.log("\n🔌 Connecting to MCP Server...");
  
  // Simulated for now, would actually connect to server in real implementation
  // using VSCode settings for connection details
  const serverUrl = "http://localhost:3000";
  
  try {
    // Mock API call 
    console.log(`[Simulated API call to ${serverUrl}/api/status]`);
    return {
      status: "connected",
      agents: [
        {
          name: "Protocol Validator Agent",
          status: "active",
          capabilities: ["Schema compliance checking", "Semantic validation of protocol content"]
        },
        {
          name: "Integration Assistant Agent",
          status: "active", 
          capabilities: ["Language-specific SDK generation", "API wrapper creation"]
        },
        {
          name: "Protocol Enhancement Agent",
          status: "active",
          capabilities: ["Identifying missing sections", "Suggesting clarifications"]
        },
        {
          name: "Monitoring & Analytics Agent", 
          status: "active",
          capabilities: ["Real-time monitoring", "Drift detection and alerting"]
        }
      ]
    };
  } catch (error) {
    console.error("Failed to connect to MCP Server:", error);
    return { status: "disconnected", error: error.message };
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

// Enhanced function to break down tasks with AI assistance
async function analyzeAndExpandTask(taskId) {
  console.log(`\n🔍 Analyzing task #${taskId} for breakdown...`);
  
  // If MCP integration is enabled, use MCP server for analysis
  if (MCP_INTEGRATE) {
    const mcpServerConnection = await connectToMcpServer();
    
    if (mcpServerConnection.status === "connected") {
      console.log("Connected to MCP Server. Using AI agents for task analysis...");
      
      // Find the appropriate agent for the current phase
      const currentPhase = CURRENT_PHASE || PHASES.IMPLEMENTATION;
      const agentName = MCP_AGENTS[currentPhase];
      
      const agent = mcpServerConnection.agents.find(a => a.name === agentName);
      
      if (agent && agent.status === "active") {
        console.log(`Using ${agent.name} for ${currentPhase} phase task analysis.`);
        return await aiDrivenTaskBreakdown(taskId, agent.name);
      } else {
        console.log(`Warning: Agent ${agentName} not available. Falling back to manual breakdown.`);
      }
    } else {
      console.log(`Warning: MCP Server connection failed: ${mcpServerConnection.error}`);
      console.log("Falling back to manual task breakdown.");
    }
  }
  
  // If MCP is not enabled or failed, proceed with enhanced semi-automated breakdown
  return await enhancedExpandTask(taskId);
}

// AI-driven task breakdown 
async function aiDrivenTaskBreakdown(taskId, agentName) {
  console.log(`\n🤖 ${agentName} is analyzing task #${taskId}...`);
  
  // This would be a real API call to the MCP server in production
  console.log("[Simulated MCP Agent analysis in progress...]");
  
  // Simulate an AI-generated breakdown
  const aiGeneratedSubtasks = [
    {
      name: `Analyze requirements for task #${taskId}`,
      description: 'Review existing documentation and identify key requirements',
      estimatedComplexity: 2,
      phase: PHASES.PLANNING
    },
    {
      name: `Design component architecture for task #${taskId}`,
      description: 'Create component diagram and define interfaces',
      estimatedComplexity: 3,
      phase: PHASES.DESIGN
    },
    {
      name: `Implement core functionality for task #${taskId}`,
      description: 'Develop the main features required by this task',
      estimatedComplexity: 4,
      phase: PHASES.IMPLEMENTATION
    },
    {
      name: `Write unit tests for task #${taskId}`,
      description: 'Create comprehensive test suite for implementation',
      estimatedComplexity: 3,
      phase: PHASES.TESTING
    },
    {
      name: `Document implementation for task #${taskId}`,
      description: 'Update README and add inline comments',
      estimatedComplexity: 2,
      phase: PHASES.REVIEW
    }
  ];
  
  // Display the AI-generated subtasks
  console.log("\n✨ AI-generated task breakdown:");
  aiGeneratedSubtasks.forEach((subtask, index) => {
    console.log(`${index + 1}. ${subtask.name} (Phase: ${subtask.phase}, Complexity: ${subtask.estimatedComplexity}/5)`);
    console.log(`   Description: ${subtask.description}`);
  });
  
  // In auto mode, accept all subtasks. In interactive mode, let user select
  let selectedSubtasks = [];
  
  if (AUTO_MODE) {
    selectedSubtasks = aiGeneratedSubtasks;
    console.log("\nAuto-accepting all AI-generated subtasks.");
  } else {
    console.log("\nSelect subtasks to create (comma-separated numbers, or 'all'):");
    const selection = await autoInput("Enter selection: ", "all");
    
    if (selection.toLowerCase() === 'all') {
      selectedSubtasks = aiGeneratedSubtasks;
    } else {
      const selectedIndices = selection.split(',').map(s => parseInt(s.trim()) - 1);
      selectedSubtasks = selectedIndices.map(i => aiGeneratedSubtasks[i]).filter(Boolean);
    }
  }
  
  // Create the selected subtasks
  for (let i = 0; i < selectedSubtasks.length; i++) {
    const subtask = selectedSubtasks[i];
    const subtaskId = 1000 + parseInt(taskId) + i;
    console.log(`\n[Simulated command: taskmaster create name="${subtask.name}" description="${subtask.description}" parent=${taskId} phase=${subtask.phase} complexity=${subtask.estimatedComplexity}]`);
    console.log(`Created subtask #${subtaskId}: ${subtask.name}`);
  }
  
  // Update the parent task
  console.log(`\n[Simulated command: taskmaster update id=${taskId} status=expanded]`);
  console.log(`Updated task #${taskId} status to 'expanded'`);
  
  return selectedSubtasks.length;
}

// Enhanced semi-automated task expansion
async function enhancedExpandTask(taskId) {
  console.log(`\nBreaking down task #${taskId} into smaller tasks...`);
  
  // Preset subtask templates by development phase
  const subtaskTemplates = {
    [PHASES.PLANNING]: [
      { name: 'Requirements analysis', description: 'Identify and document requirements' },
      { name: 'Feasibility assessment', description: 'Evaluate technical feasibility' }
    ],
    [PHASES.DESIGN]: [
      { name: 'Component design', description: 'Define component architecture' },
      { name: 'Interface definition', description: 'Design public interfaces and APIs' }
    ],
    [PHASES.IMPLEMENTATION]: [
      { name: 'Core functionality', description: 'Implement main features' },
      { name: 'Edge case handling', description: 'Handle error conditions and edge cases' }
    ],
    [PHASES.TESTING]: [
      { name: 'Unit tests', description: 'Create comprehensive test suite' },
      { name: 'Integration testing', description: 'Test interaction with other components' }
    ],
    [PHASES.REVIEW]: [
      { name: 'Code review', description: 'Perform peer code review' },
      { name: 'Documentation', description: 'Update documentation' }
    ],
    [PHASES.DEPLOYMENT]: [
      { name: 'Release preparation', description: 'Prepare for deployment' },
      { name: 'Deployment validation', description: 'Verify successful deployment' }
    ]
  };
  
  const currentPhase = CURRENT_PHASE || PHASES.IMPLEMENTATION;
  console.log(`Current development phase: ${currentPhase}`);
  
  // Get templates for the current phase
  const phaseTemplates = subtaskTemplates[currentPhase] || subtaskTemplates[PHASES.IMPLEMENTATION];
  
  // Collect subtasks
  const subtasks = [];
  let addingSubtasks = true;
  let subtaskCounter = 1;
  
  if (AUTO_MODE) {
    // In auto mode, use all templates from the current phase
    subtasks.push(...phaseTemplates);
    addingSubtasks = false;
  } else {
    // Show templates as suggestions
    console.log("\nSuggested subtasks for this phase:");
    phaseTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name}: ${template.description}`);
    });
    
    const useTemplates = await autoConfirm("\nUse these templates as a starting point? (y/n): ", true);
    if (useTemplates === 'y') {
      subtasks.push(...phaseTemplates);
      subtaskCounter = phaseTemplates.length + 1;
    }
  }
  
  while (addingSubtasks) {
    const subtaskName = await autoInput(`Enter name for subtask #${subtaskCounter} (or 'done' to finish): `);
    
    if (subtaskName.toLowerCase() === 'done') {
      addingSubtasks = false;
      break;
    }
    
    const subtaskDescription = await autoInput(`Enter description for "${subtaskName}": `);
    const subtaskPhase = await autoInput(`Enter phase for subtask (${Object.values(PHASES).join(', ')}): `, currentPhase);
    
    subtasks.push({
      name: subtaskName,
      description: subtaskDescription,
      phase: subtaskPhase
    });
    
    subtaskCounter++;
  }
  
  if (subtasks.length === 0) {
    console.log("No subtasks created. Task expansion cancelled.");
    return 0;
  }
  
  // Display the subtasks
  console.log("\nCreating the following subtasks:");
  subtasks.forEach((subtask, index) => {
    console.log(`${index + 1}. ${subtask.name} (Phase: ${subtask.phase || currentPhase})`);
    console.log(`   Description: ${subtask.description}`);
  });
  
  // Simulate creating subtasks in taskmaster
  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    const subtaskId = 1000 + parseInt(taskId) + i;
    console.log(`\n[Simulated command: taskmaster create name="${subtask.name}" description="${subtask.description}" parent=${taskId} phase=${subtask.phase || currentPhase}]`);
    console.log(`Created subtask #${subtaskId}: ${subtask.name}`);
  }
  
  // Update the parent task
  console.log(`\n[Simulated command: taskmaster update id=${taskId} status=expanded]`);
  console.log(`Updated task #${taskId} status to 'expanded'`);
  
  return subtasks.length;
}

// Generate progress report with phase-based visualization
async function generateProgressReport() {
  console.log('\n📊 TASKMASTER PROGRESS REPORT\n');
  
  // Get all tasks for dashboard
  const tasks = await taskmaster('list');
  
  // Calculate metrics
  const totalTasks = tasks.split('\n').length;
  const completedTasks = tasks.split('\n').filter(task => task.includes('completed')).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Display metrics
  console.log(`📈 PROJECT METRICS:`);
  console.log(`  Total Tasks: ${totalTasks}`);
  console.log(`  Completed: ${completedTasks}`);
  console.log(`  Completion Rate: ${completionRate}%`);
  console.log(`  Current Focus: ${tasks.split('\n').find(task => task.includes('in-progress')) || 'None'}\n`);
  
  // Simulate phase-based metrics
  const phaseMetrics = {
    [PHASES.PLANNING]: { total: 5, completed: 5, inProgress: 0 },
    [PHASES.DESIGN]: { total: 8, completed: 7, inProgress: 1 },
    [PHASES.IMPLEMENTATION]: { total: 15, completed: 8, inProgress: 2 },
    [PHASES.TESTING]: { total: 12, completed: 3, inProgress: 1 },
    [PHASES.REVIEW]: { total: 4, completed: 0, inProgress: 0 },
    [PHASES.DEPLOYMENT]: { total: 3, completed: 0, inProgress: 0 }
  };
  
  // Display phase-based progress
  console.log(`📋 DEVELOPMENT PHASE PROGRESS:`);
  
  Object.entries(phaseMetrics).forEach(([phase, metrics]) => {
    const phaseCompletion = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0;
    const progressBar = generateProgressBar(phaseCompletion);
    console.log(`  ${phase.padEnd(15)} ${progressBar} ${phaseCompletion}% (${metrics.completed}/${metrics.total})`);
    
    if (metrics.inProgress > 0) {
      console.log(`  ${''.padEnd(15)} 🚧 ${metrics.inProgress} tasks in progress`);
    }
  });
  
  console.log('\n');
}

// Generate ASCII progress bar
function generateProgressBar(percentage, length = 20) {
  const filledLength = Math.round(length * percentage / 100);
  const emptyLength = length - filledLength;
  
  return `[${'='.repeat(filledLength)}${'-'.repeat(emptyLength)}]`;
}

// Display a visual task dashboard with phase information
async function displayEnhancedDashboard() {
  console.log('\n📊 TASKMASTER DASHBOARD\n');
  
  // Get all tasks
  const tasks = await taskmaster('list');
  
  // Calculate metrics
  const totalTasks = tasks.split('\n').length;
  const completedTasks = tasks.split('\n').filter(task => task.includes('✅ Completed')).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Display metrics
  console.log(`📈 METRICS:`);
  console.log(`  Total Tasks: ${totalTasks}`);
  console.log(`  Completed: ${completedTasks}`);
  console.log(`  Completion Rate: ${completionRate}%`);
  console.log(`  Current Focus: ${tasks.split('\n').find(task => !task.includes('✅ Completed')) || 'None'}\n`);
  
  // Display task table header with phase column
  console.log('📋 CURRENT TASKS:');
  console.log('  ID  | Task Name                      | Status     | Priority  | Phase        ');
  console.log('  ----+--------------------------------+------------+-----------+--------------');
  
  // Display task rows
  tasks.split('\n').forEach(task => {
    const id = task.split(' - ')[0].padEnd(3);
    const name = task.split(' - ')[1].substring(0, 30).padEnd(30);
    const status = getStatusDisplay(task.split(' - ')[2]);
    const priority = getPriorityDisplay(task.split(' - ')[3]);
    // Simulating phase data here
    const phase = getPhaseDisplay(CURRENT_PHASE || PHASES.IMPLEMENTATION);
    
    console.log(`  ${id} | ${name} | ${status} | ${priority} | ${phase}`);
  });
  
  console.log('\n');
  
  // Show the next tasks to focus on
  console.log('🔍 FOCUS SUGGESTIONS:');
  console.log('  Based on current progress, focus on these high-priority tasks:');
  
  // Example suggestions - would come from actual task data in real implementation
  console.log('  1. Complete remaining Design phase tasks');
  console.log('  2. Start Implementation phase for critical components');
  console.log('  3. Prepare Testing phase infrastructure');
  
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
    case 'High':
      return '🔴 High'.padEnd(9);
    case 'Medium':
      return '🟠 Med '.padEnd(9);
    case 'Low':
      return '🟢 Low '.padEnd(9);
    default:
      return '⚪ --- '.padEnd(9);
  }
}

function getPhaseDisplay(phase) {
  switch (phase) {
    case PHASES.PLANNING:
      return '📝 Planning'.padEnd(12);
    case PHASES.DESIGN:
      return '🎨 Design'.padEnd(12);
    case PHASES.IMPLEMENTATION:
      return '👨‍💻 Implement'.padEnd(12);
    case PHASES.TESTING:
      return '🧪 Testing'.padEnd(12);
    case PHASES.REVIEW:
      return '👁️ Review'.padEnd(12);
    case PHASES.DEPLOYMENT:
      return '🚀 Deploy'.padEnd(12);
    default:
      return '❓ Unknown'.padEnd(12);
  }
}

// Display help message
if (SHOW_HELP) {
  console.log('\n🔍 Enhanced Taskmaster Workflow Help:');
  console.log('  --auto             Run in automatic mode');
  console.log('  --complete-current Mark current task as complete');
  console.log('  --task             Display task information');
  console.log('  --dashboard        Display task dashboard');
  console.log('  --phase=<phase>    Set current development phase');
  console.log('  --analyze-task=<id> Analyze and break down specific task');
  console.log('  --tradeoff-analysis Perform tradeoff analysis');
  console.log('  --tradeoff-task=<id> Analyze tradeoffs for specific task');
  console.log('  --mcp-integrate    Use MCP server integration');
  console.log('  --progress-report  Generate phase-based progress report');
  console.log('  --help             Show this help message\n');
  console.log('Available phases:');
  Object.values(PHASES).forEach(phase => {
    console.log(`  * ${phase}`);
  });
  console.log('\n');
  process.exit(0);
}

// Main execution branching
if (TRADEOFF_ANALYSIS || TRADEOFF_TASK_ID) {
  // Perform tradeoff analysis
  const taskId = TRADEOFF_TASK_ID || (SPECIFIC_TASK_ID || '123');
  performTradeoffAnalysis(taskId).then(() => {
    if (AUTO_MODE) {
      process.exit(0);
    } else if (rl) {
      rl.close();
    }
  });
} else if (ANALYZE_TASK_ID) {
  // Analyze and break down a specific task
  analyzeAndExpandTask(ANALYZE_TASK_ID).then(() => {
    if (AUTO_MODE) {
      process.exit(0);
    } else if (rl) {
      rl.close();
    }
  });
} else if (PROGRESS_REPORT) {
  // Generate a progress report
  generateProgressReport().then(() => {
    if (AUTO_MODE) {
      process.exit(0);
    } else if (rl) {
      rl.close();
    }
  });
} else if (SHOW_TASKS || SHOW_DASHBOARD) {
  // Display enhanced dashboard
  displayEnhancedDashboard().then(() => {
    if (AUTO_MODE) {
      process.exit(0);
    } else if (rl) {
      rl.close();
    }
  });
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
  
  if (MCP_INTEGRATE) {
    const mcpServerConnection = await connectToMcpServer();
    if (mcpServerConnection.status === "connected") {
      console.log(`Successfully connected to MCP Server with ${mcpServerConnection.agents.length} available agents.`);
    } else {
      console.log(`Warning: Failed to connect to MCP Server: ${mcpServerConnection.error}`);
      console.log("Continuing without MCP server integration.");
    }
  }
  
  await phaseBasedWorkflowMain();
}

// Interactive workflow function
async function runInteractiveMode() {
  console.log("\n👤 Running in interactive mode...");
  
  if (MCP_INTEGRATE) {
    console.log("Attempting to connect to MCP Server...");
    const mcpServerConnection = await connectToMcpServer();
    
    if (mcpServerConnection.status === "connected") {
      console.log(`Successfully connected to MCP Server with ${mcpServerConnection.agents.length} available agents.`);
      console.log("\nAvailable MCP Agents:");
      
      mcpServerConnection.agents.forEach(agent => {
        console.log(`  • ${agent.name} (${agent.status})`);
        console.log(`    Capabilities: ${agent.capabilities.join(', ')}`);
      });
    } else {
      console.log(`Warning: Failed to connect to MCP Server: ${mcpServerConnection.error}`);
      const proceed = await autoConfirm("Continue without MCP server integration? (y/n): ", true);
      if (proceed !== 'y') {
        console.log("Exiting workflow.");
        if (rl) {rl.close();}
        return;
      }
    }
  }
  
  await phaseBasedWorkflowMain();
}

// Phase-based main workflow function
async function phaseBasedWorkflowMain() {
  try {
    // Complete current task mode
    if (COMPLETE_CURRENT) {
      console.log("Running in complete-current mode");
      const currentTask = await taskmaster('current');
      let currentTaskObj;
      
      try {
        currentTaskObj = JSON.parse(currentTask);
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
    
    // Show current phase (if specified)
    if (CURRENT_PHASE) {
      console.log(`\n🔍 Current development phase: ${CURRENT_PHASE}`);
    }
    
    console.log("\nChecking current tasks...");
    const tasks = await taskmaster('list');
    console.log(tasks);
    
    // Get next task matching the current phase if specified
    console.log("\nIdentifying next task to work on...");
    const nextTaskJson = await taskmaster('next');
    let nextTask;
    
    try {
      nextTask = JSON.parse(nextTaskJson);
    } catch (e) {
      console.log("Error parsing task JSON, using simulated task");
      nextTask = { 
        id: SPECIFIC_TASK_ID || '123', 
        name: 'Implement TypeScript event handlers compatibility',
        phase: CURRENT_PHASE || PHASES.IMPLEMENTATION
      };
    }
    
    console.log(`Next task: #${nextTask.id} - ${nextTask.name} (Phase: ${nextTask.phase || 'Not specified'})`);
    
    // If the task isn't in the current phase, ask if the user wants to work on it anyway
    if (CURRENT_PHASE && nextTask.phase && nextTask.phase !== CURRENT_PHASE) {
      console.log(`\n⚠️ Warning: This task is assigned to the ${nextTask.phase} phase, but you're currently in the ${CURRENT_PHASE} phase.`);
      const proceed = await autoConfirm('Do you want to work on this task anyway? (y/n): ', AUTO_MODE);
      if (proceed !== 'y') {
        console.log("Looking for a task in the current phase...");
        
        // In a real implementation, this would actually query for a task in the current phase
        console.log("No suitable tasks found in the current phase. Exiting workflow.");
        
        if (AUTO_MODE) {
          process.exit(0);
        } else if (rl) {
          rl.close();
        }
        return;
      }
    }
    
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
    await taskmaster(`update id=${nextTask.id} status=in-progress`);
    
    // Check dependencies
    console.log("\nChecking dependencies...");
    const depsJson = await taskmaster(`deps ${nextTask.id}`);
    let deps = [];
    
    try {
      deps = JSON.parse(depsJson);
    } catch (e) {
      console.log("Error parsing dependencies JSON, assuming no dependencies");
    }
    
    const incompleteDeps = deps.filter(d => d.status !== 'completed');
    
    if (incompleteDeps.length > 0) {
      console.log("Warning: Task has incomplete dependencies!");
      incompleteDeps.forEach(d => {
        console.log(`#${d.id} - ${d.name} [${d.status}]`);
      });
      
      const cont = await autoConfirm('Continue anyway? (y/n): ', AUTO_MODE);
      if (cont !== 'y') {
        console.log("Marking task as blocked. Exiting workflow.");
        await taskmaster(`update id=${nextTask.id} status=blocked`);
        
        if (AUTO_MODE) {
          process.exit(0);
        } else if (rl) {
          rl.close();
        }
        return;
      }
    }
    
    // Analyze and break down the task if needed
    const shouldAnalyze = await autoConfirm('\nWould you like to analyze and break down this task? (y/n): ', false);
    if (shouldAnalyze === 'y') {
      await analyzeAndExpandTask(nextTask.id);
      
      if (AUTO_MODE) {
        process.exit(0);
      } else if (rl) {
        rl.close();
      }
      return;
    }
    
    // Continue with normal workflow
    await continueWorkflow(nextTask.id);
    
  } catch (error) {
    console.error("Error in workflow:", error);
    
    if (AUTO_MODE) {
      process.exit(1);
    } else if (rl) {
      rl.close();
    }
  }
}

// Continue workflow with enhanced tradeoff awareness
async function continueWorkflow(taskId) {
  console.log("\n--- Work on your task now ---");
  console.log("Open the files you need to modify and implement your changes.");
  
  if (!AUTO_MODE) {
    console.log("When you're done, come back to this terminal.");
  }
  
  // In auto mode, we skip the implementation part
  if (AUTO_MODE) {
    console.log("Auto mode: Assuming task implementation is done");
    await completeTask(taskId);
    process.exit(0);
    return;
  }
  
  // Suggest tradeoff analysis if not already performed
  if (!AUTO_MODE) {
    const offerTradeoffAnalysis = await autoConfirm('\nWould you like to perform tradeoff analysis for this task? (y/n): ', false);
    if (offerTradeoffAnalysis === 'y') {
      await performTradeoffAnalysis(taskId);
      // After tradeoff analysis, continue with the workflow
    }
  }
  
  // Progress reporting during task work
  const inProgressFeedback = await autoConfirm('\nWould you like to record progress notes? (y/n): ', false);
  if (inProgressFeedback === 'y') {
    const progressNotes = await autoInput('Enter progress notes (single line): ', 
      'Made significant progress on core functionality, needs more testing');
    
    console.log("Updating task with progress notes...");
    await taskmaster(`update id=${taskId} progressNotes="${progressNotes}"`);
  }
  
  const completed = await autoConfirm('\nIs the task completed? (y/n): ', true);
  if (completed !== 'y') {
    const breakdown = await autoConfirm('Do you need to break down this task into smaller tasks? (y/n): ', false);
    if (breakdown === 'y') {
      await analyzeAndExpandTask(taskId);
    } else {
      console.log("Task remains in progress. You can continue later.");
    }
    
    if (rl) {rl.close();}
    return;
  }
  
  const hasDecisions = await autoConfirm('Any architectural decisions to document? (y/n): ', false);
  if (hasDecisions === 'y') {
    const notes = await autoInput('Enter decision notes (single line): ', 
      'Implemented using factory pattern for better type safety and component compatibility');
    
    console.log("Updating task with architectural decisions...");
    await taskmaster(`update id=${taskId} notes="${notes}"`);
    
    // Save notes to documentation file
    const docsDir = path.join(process.cwd(), 'docs', 'taskmaster');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    const notesFile = path.join(docsDir, `task-${taskId}-notes.md`);
    fs.writeFileSync(notesFile, `# Task #${taskId} Notes\n\n## Architectural Decisions\n\n${notes}\n`);
  }
  
  await completeTask(taskId);
}

// Complete the task and show next task
async function completeTask(taskId) {
  console.log("\nMarking task as completed...");
  await taskmaster(`update id=${taskId} status=completed`);
  
  console.log(`Task #${taskId} completed successfully!`);
  
  // Regenerate progress report after task completion
  if (MCP_INTEGRATE || PROGRESS_REPORT) {
    await generateProgressReport();
  }
  
  // Show next task
  console.log("\nSuggested next task:");
  const nextTask = await taskmaster('next');
  console.log(nextTask);
  
  console.log("\nWorkflow completed. Good job!");
  
  if (!AUTO_MODE && rl) {
    rl.close();
  }
}

// Main workflow execution
if (!ANALYZE_TASK_ID && !PROGRESS_REPORT && !SHOW_TASKS && !SHOW_DASHBOARD) {
  phaseBasedWorkflowMain();
}

/**
 * Performs tradeoff analysis for a specific task
 * Analyzes different approaches, their benefits and drawbacks
 * Helps make informed decisions on implementation strategy
 */
async function performTradeoffAnalysis(taskId) {
  console.log(`\n⚖️ TRADEOFF ANALYSIS FOR TASK #${taskId}\n`);
  
  // Get task details
  const taskJson = await taskmaster(`task ${taskId}`);
  let task;
  
  try {
    task = JSON.parse(taskJson);
  } catch (e) {
    console.log("Error parsing task JSON, using simulated task");
    task = { 
      id: taskId, 
      name: 'Implement TypeScript event handlers compatibility',
      description: 'Create type-safe event handlers that work with both React and VSCode components',
      phase: CURRENT_PHASE || PHASES.IMPLEMENTATION
    };
  }
  
  console.log(`Task: #${task.id} - ${task.name}`);
  console.log(`Description: ${task.description || 'No description available'}`);
  console.log(`Phase: ${task.phase || 'Not specified'}\n`);
  
  // If MCP integration is enabled, use MCP server for enhanced analysis
  let approaches = [];
  
  if (MCP_INTEGRATE) {
    approaches = await getMcpAssistedTradeoffAnalysis(task);
  } else {
    approaches = await getBasicTradeoffAnalysis(task);
  }
  
  // Display the approaches and their tradeoffs
  console.log("\n📊 IMPLEMENTATION APPROACHES:\n");
  
  approaches.forEach((approach, index) => {
    console.log(`🔹 APPROACH ${index + 1}: ${approach.name}`);
    console.log(`   Description: ${approach.description}`);
    
    console.log("   Pros:");
    approach.pros.forEach(pro => console.log(`   ✅ ${pro}`));
    
    console.log("   Cons:");
    approach.cons.forEach(con => console.log(`   ❌ ${con}`));
    
    console.log(`   Complexity: ${approach.complexity}/5`);
    console.log(`   Risk: ${approach.risk}/5`);
    console.log(`   Time Estimate: ${approach.timeEstimate} hours\n`);
  });
  
  // In interactive mode, let the user choose an approach
  if (!AUTO_MODE) {
    const selectedApproach = await selectImplementationApproach(approaches);
    await documentTradeoffDecision(taskId, selectedApproach, approaches);
  } else {
    // In auto mode, calculate the best approach based on weighted scores
    const bestApproach = findBestApproach(approaches);
    console.log(`Auto-selected approach: ${bestApproach.name}`);
    await documentTradeoffDecision(taskId, bestApproach, approaches);
  }
  
  // Check if the user wants to proceed with task breakdown based on the selected approach
  if (!AUTO_MODE) {
    const proceedWithBreakdown = await autoConfirm('\nWould you like to break this task down based on the selected approach? (y/n): ', true);
    if (proceedWithBreakdown === 'y') {
      await analyzeAndExpandTask(taskId);
    }
  }
  
  return true;
}

/**
 * Get tradeoff analysis with MCP server assistance
 */
async function getMcpAssistedTradeoffAnalysis(task) {
  console.log("🔍 Using MCP server for enhanced tradeoff analysis...");
  
  const mcpServerConnection = await connectToMcpServer();
  
  if (mcpServerConnection.status !== "connected") {
    console.log(`Warning: MCP Server connection failed: ${mcpServerConnection.error}`);
    console.log("Falling back to basic tradeoff analysis.");
    return await getBasicTradeoffAnalysis(task);
  }
  
  const agentName = MCP_AGENTS['tradeoff-analysis'];
  const agent = mcpServerConnection.agents.find(a => a.name === agentName);
  
  if (!agent || agent.status !== "active") {
    console.log(`Warning: Agent ${agentName} not available. Falling back to basic analysis.`);
    return await getBasicTradeoffAnalysis(task);
  }
  
  console.log(`Using ${agent.name} for tradeoff analysis...`);
  console.log("[Simulated MCP Agent analysis in progress...]");
  
  // Simulate AI-assisted tradeoff analysis with more detailed insights
  // In a real implementation, this would call the MCP server's API
  return [
    {
      name: "Factory Pattern with Type Generics",
      description: "Implement a factory pattern using TypeScript generics to create handlers that work with both React and VSCode events",
      pros: [
        "Provides strong type safety across all event handlers",
        "Centralizes event handling logic in a single implementation",
        "Allows for consistent error handling and logging",
        "Enables easy extension for future event types",
        "Reduces code duplication across components"
      ],
      cons: [
        "Adds complexity with generic type parameters",
        "Requires more upfront design work",
        "Small performance overhead due to factory abstraction",
        "Learning curve for developers unfamiliar with the pattern",
        "Requires thorough documentation of the interface"
      ],
      complexity: 4,
      risk: 3,
      timeEstimate: 12,
      codeImpact: "Medium - Affects all event handling code but isolated to handler creation",
      testingStrategy: "Create unit tests for the factory and integration tests for component usage"
    },
    {
      name: "Adapter Functions with Type Casting",
      description: "Create adapter functions that translate between React and VSCode event types using type casting",
      pros: [
        "Simpler implementation than the factory pattern",
        "Individual adapters can be implemented incrementally",
        "More transparent to developers familiar with both component types",
        "Easier to debug with less abstraction",
        "Can be applied selectively where needed"
      ],
      cons: [
        "More type casting required, potentially reducing type safety",
        "Dispersed implementation across multiple adapter functions",
        "Could lead to inconsistent handling patterns",
        "Higher maintenance burden when event interfaces change",
        "More difficult to apply consistent error handling"
      ],
      complexity: 2,
      risk: 2,
      timeEstimate: 8,
      codeImpact: "Low - Only affects specific event handlers that need cross-compatibility",
      testingStrategy: "Test each adapter function separately with mock events"
    },
    {
      name: "Higher Order Component with Unified Interface",
      description: "Create a HOC wrapper that provides a consistent event interface regardless of underlying component",
      pros: [
        "Completely abstracts away the differences between event systems",
        "Components don't need to know about event system differences",
        "Can provide additional cross-cutting features (logging, analytics)",
        "Allows for better separation of concerns in components",
        "Most maintainable solution for large component libraries"
      ],
      cons: [
        "Highest implementation complexity of all approaches",
        "Adds a wrapper layer to the component hierarchy",
        "Potential performance impact with extra component renders",
        "Debugging through the HOC can be challenging",
        "Requires thorough documentation for team adoption"
      ],
      complexity: 5,
      risk: 4,
      timeEstimate: 16,
      codeImpact: "High - Affects component architecture and event flow",
      testingStrategy: "Create comprehensive tests for the HOC and its interaction with both component types"
    },
    {
      name: "Custom Hook with Environment Detection",
      description: "Create a custom React hook that detects the environment and provides appropriate event handlers",
      pros: [
        "React-centric solution aligns with modern functional components",
        "Encapsulates detection logic and keeps components clean",
        "Can leverage React's built-in optimization features",
        "Familiar pattern for React developers",
        "Easy to combine with other hooks for additional functionality"
      ],
      cons: [
        "Only works with functional components, not class components",
        "VSCode's extension architecture may have edge cases not covered",
        "Slightly more complex than direct adapters",
        "Environment detection could be fragile if implementation changes",
        "Hook dependencies need careful management"
      ],
      complexity: 3,
      risk: 2,
      timeEstimate: 10,
      codeImpact: "Medium - Affects how component event handlers are created",
      testingStrategy: "Test the hook in isolation and with component integration tests"
    }
  ];
}

/**
 * Get basic tradeoff analysis without MCP server
 */
async function getBasicTradeoffAnalysis(task) {
  console.log("📊 Performing basic tradeoff analysis...");
  
  // Would typically gather requirements and context from task description
  // Here we're using a simplified implementation
  
  // Generate basic approaches based on common patterns
  return [
    {
      name: "Direct Type Casting",
      description: "Cast event types directly between React and VSCode events",
      pros: [
        "Simple implementation with minimal code",
        "Quick to implement",
        "Low learning curve for the team"
      ],
      cons: [
        "Reduced type safety",
        "May miss edge cases in different event structures",
        "Harder to maintain as component APIs evolve"
      ],
      complexity: 1,
      risk: 4,
      timeEstimate: 4
    },
    {
      name: "Adapter Pattern",
      description: "Create adapter functions to convert between different event types",
      pros: [
        "Better separation of concerns",
        "More maintainable as component interfaces change",
        "Improves code organization"
      ],
      cons: [
        "More code to write and maintain",
        "Requires consistent usage across codebase",
        "Additional abstraction layer"
      ],
      complexity: 3,
      risk: 2,
      timeEstimate: 8
    },
    {
      name: "Event Normalization",
      description: "Create a normalized event interface that works with both systems",
      pros: [
        "Most flexible solution for future changes",
        "Best type safety and consistency",
        "Centralizes event handling logic"
      ],
      cons: [
        "Most complex implementation",
        "Higher upfront development cost",
        "May introduce performance overhead"
      ],
      complexity: 4,
      risk: 3,
      timeEstimate: 12
    }
  ];
}

/**
 * Let the user select an implementation approach
 */
async function selectImplementationApproach(approaches) {
  console.log("\nSelect an implementation approach:");
  
  approaches.forEach((approach, index) => {
    console.log(`${index + 1}. ${approach.name} (Complexity: ${approach.complexity}/5, Risk: ${approach.risk}/5)`);
  });
  
  const selection = await autoInput("\nEnter approach number: ", "1");
  const selectedIndex = parseInt(selection) - 1;
  
  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= approaches.length) {
    console.log("Invalid selection. Defaulting to first approach.");
    return approaches[0];
  }
  
  return approaches[selectedIndex];
}

/**
 * Document the selected approach and reasons for the decision
 */
async function documentTradeoffDecision(taskId, selectedApproach, allApproaches) {
  console.log("\n📝 Documenting implementation decision...");
  
  // In a real implementation, this would update the task in the task tracking system
  console.log(`[Simulated command: taskmaster update id=${taskId} approach="${selectedApproach.name}"]`);
  
  // If the user chose an approach, ask for the reasons
  let decisionReasons = "";
  
  if (!AUTO_MODE) {
    decisionReasons = await autoInput("Enter reasons for selecting this approach (optional): ", "");
  }
  
  // Create a decision document
  const docsDir = path.join(process.cwd(), 'docs', 'taskmaster', 'decisions');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  const decisionFile = path.join(docsDir, `task-${taskId}-tradeoff-analysis.md`);
  
  const now = new Date().toISOString().split('T')[0];
  const decisionContent = `# Task #${taskId} Tradeoff Analysis

## Date
${now}

## Selected Approach
**${selectedApproach.name}**

${selectedApproach.description}

### Implementation Notes
- Complexity: ${selectedApproach.complexity}/5
- Risk: ${selectedApproach.risk}/5
- Time Estimate: ${selectedApproach.timeEstimate} hours

${decisionReasons ? `## Decision Rationale\n${decisionReasons}\n` : ''}

## Approaches Considered

${allApproaches.map((approach, index) => `
### ${index + 1}. ${approach.name}
${approach.description}

**Pros:**
${approach.pros.map(pro => `- ${pro}`).join('\n')}

**Cons:**
${approach.cons.map(con => `- ${con}`).join('\n')}

**Metrics:**
- Complexity: ${approach.complexity}/5
- Risk: ${approach.risk}/5
- Time Estimate: ${approach.timeEstimate} hours
${approach.codeImpact ? `- Code Impact: ${approach.codeImpact}` : ''}
${approach.testingStrategy ? `- Testing Strategy: ${approach.testingStrategy}` : ''}
`).join('\n')}
`;

  fs.writeFileSync(decisionFile, decisionContent);
  console.log(`Created tradeoff analysis document: ${decisionFile}`);
  
  return true;
}

/**
 * Finds the best approach using weighted criteria
 * 
 * Formula: 
 * Score = (5 - complexity) * complexityWeight + 
 *         (5 - risk) * riskWeight + 
 *         (20 / timeEstimate) * timeWeight
 */
function findBestApproach(approaches) {
  if (!approaches || !Array.isArray(approaches) || approaches.length === 0) {
    return null;
  }
  
  // Default weights - these can be adjusted based on project priorities
  const weights = {
    complexity: 0.4,  // Higher weight means we value simplicity more
    risk: 0.4,        // Higher weight means we avoid risk more
    time: 0.2         // Higher weight means we value quick implementation more
  };
  
  // Calculate weighted scores for each approach
  const scoredApproaches = approaches.map(approach => {
    // Extract metrics with fallbacks to default values
    const complexity = typeof approach.complexity === 'number' ? approach.complexity : 3;
    const risk = typeof approach.risk === 'number' ? approach.risk : 3;
    const timeEstimate = typeof approach.timeEstimate === 'number' ? approach.timeEstimate : 8;
    
    // Calculate individual scores (higher is better)
    const complexityScore = (5 - complexity) * weights.complexity;
    const riskScore = (5 - risk) * weights.risk;
    const timeScore = (20 / timeEstimate) * weights.time;
    
    // Calculate total weighted score
    const totalScore = complexityScore + riskScore + timeScore;
    
    return {
      ...approach,
      scores: {
        complexity: complexityScore,
        risk: riskScore,
        time: timeScore
      },
      totalScore
    };
  });
  
  // Sort by total score (highest first)
  scoredApproaches.sort((a, b) => b.totalScore - a.totalScore);
  
  // Return the approach with the highest score
  return scoredApproaches[0];
} 