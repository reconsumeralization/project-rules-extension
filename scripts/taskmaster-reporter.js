#!/usr/bin/env node

/**
 * Taskmaster Reporter for Project Rules Extension
 * 
 * Generates comprehensive reports and visualizations for task management:
 * 1. Progress reports and burndown charts
 * 2. Team performance metrics and velocity tracking
 * 3. Dependency visualizations and critical path analysis
 * 4. Task completion forecasts and trend analysis
 * 
 * Usage:
 *   node taskmaster-reporter.js                    // Interactive mode
 *   node taskmaster-reporter.js --progress         // Generate progress report
 *   node taskmaster-reporter.js --team             // Generate team performance report
 *   node taskmaster-reporter.js --dependencies     // Generate dependency chart
 *   node taskmaster-reporter.js --forecast         // Generate completion forecast
 *   node taskmaster-reporter.js --format=html      // Set output format (html, json, md)
 *   node taskmaster-reporter.js --output=file.html // Specify output file
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const PROGRESS_REPORT = args.includes('--progress');
const TEAM_REPORT = args.includes('--team');
const DEPENDENCY_CHART = args.includes('--dependencies');
const FORECAST_REPORT = args.includes('--forecast');
const FORMAT_ARG = args.find(arg => arg.startsWith('--format='));
const OUTPUT_ARG = args.find(arg => arg.startsWith('--output='));
const FORMAT = FORMAT_ARG ? FORMAT_ARG.split('=')[1] : 'console';
const OUTPUT_FILE = OUTPUT_ARG ? OUTPUT_ARG.split('=')[1] : null;

// Configuration
const config = {
  outputDir: path.join(process.cwd(), 'docs', 'taskmaster', 'reports'),
  schedulePath: path.join(process.cwd(), 'docs', 'taskmaster', 'schedule.json'),
  teamDataPath: path.join(process.cwd(), 'docs', 'taskmaster', 'team-data.json'),
  historyPath: path.join(process.cwd(), 'docs', 'taskmaster', 'task-history.json')
};

// Create readline interface for user input
const rl = readline.createInterface({
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
      // Simulation mode
      console.log(`[Simulated command: ${command}]`);
      
      if (args === 'list') {
        return JSON.stringify([
          { id: '123', name: 'Implement TypeScript event handlers', status: 'in-progress', priority: 'high', dueDate: '2023-04-15', estimatedHours: 4, actualHours: 3, assignedTo: 'dev1', completedDate: null, startDate: '2023-04-10', dependencies: [] },
          { id: '124', name: 'Add unit tests for event handlers', status: 'pending', priority: 'medium', dueDate: '2023-04-18', estimatedHours: 2, actualHours: 0, assignedTo: 'dev2', completedDate: null, startDate: null, dependencies: ['123'] },
          { id: '125', name: 'Update documentation', status: 'pending', priority: 'low', dueDate: '2023-04-20', estimatedHours: 1, actualHours: 0, assignedTo: null, completedDate: null, startDate: null, dependencies: ['123', '124'] },
          { id: '120', name: 'Setup project structure', status: 'completed', priority: 'high', dueDate: '2023-04-05', estimatedHours: 2, actualHours: 3, assignedTo: 'dev1', completedDate: '2023-04-05', startDate: '2023-04-03', dependencies: [] },
          { id: '121', name: 'Create initial models', status: 'completed', priority: 'medium', dueDate: '2023-04-08', estimatedHours: 3, actualHours: 2, assignedTo: 'dev3', completedDate: '2023-04-07', startDate: '2023-04-06', dependencies: ['120'] },
          { id: '122', name: 'Implement basic UI components', status: 'completed', priority: 'medium', dueDate: '2023-04-10', estimatedHours: 5, actualHours: 6, assignedTo: 'dev2', completedDate: '2023-04-09', startDate: '2023-04-06', dependencies: ['120'] }
        ]);
      } else if (args.startsWith('team')) {
        return JSON.stringify([
          { id: 'dev1', name: 'John Smith', role: 'Developer', tasksCompleted: 8, avgCompletion: 0.9, velocity: 5 },
          { id: 'dev2', name: 'Jane Doe', role: 'Developer', tasksCompleted: 6, avgCompletion: 1.1, velocity: 4 },
          { id: 'dev3', name: 'Bob Johnson', role: 'Designer', tasksCompleted: 4, avgCompletion: 0.8, velocity: 3 }
        ]);
      } else if (args.startsWith('history')) {
        return JSON.stringify({
          weeklyVelocity: [12, 14, 10, 15, 13, 14, 16],
          weeklyCompletion: ['2023-03-05', '2023-03-12', '2023-03-19', '2023-03-26', '2023-04-02', '2023-04-09', '2023-04-16'],
          burndown: [45, 38, 32, 28, 20, 15, 10, 7]
        });
      }
      
      return '[]';
    }
  } catch (error) {
    console.error(`Failed to execute taskmaster command: ${error}`);
    return '[]';
  }
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
}

/**
 * Generate a simple ASCII progress bar
 */
function generateProgressBar(percentage, length = 20) {
  const filled = Math.floor(percentage * length);
  const empty = length - filled;
  return '[' + '='.repeat(filled) + ' '.repeat(empty) + '] ' + Math.round(percentage * 100) + '%';
}

/**
 * Generate a progress report
 */
async function generateProgressReport() {
  console.log("Generating progress report...");
  
  // Get tasks and history data
  const tasksJson = await taskmaster('list');
  const historyJson = await taskmaster('history');
  
  let tasks = [];
  let history = { weeklyVelocity: [], weeklyCompletion: [], burndown: [] };
  
  try {
    tasks = JSON.parse(tasksJson);
    history = JSON.parse(historyJson);
  } catch (error) {
    console.error("Failed to parse task data:", error);
  }
  
  // Calculate metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;
  const pendingTasks = tasks.filter(task => task.status === 'pending').length;
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  
  // Calculate estimated vs actual hours
  let totalEstimatedHours = 0;
  let totalActualHours = 0;
  
  tasks.filter(task => task.status === 'completed').forEach(task => {
    totalEstimatedHours += task.estimatedHours || 0;
    totalActualHours += task.actualHours || 0;
  });
  
  const estimationAccuracy = totalEstimatedHours > 0 ? totalActualHours / totalEstimatedHours : 0;
  
  // Create report content based on format
  let reportContent = '';
  
  if (FORMAT === 'html') {
    reportContent = `<!DOCTYPE html>
<html>
<head>
  <title>Taskmaster Progress Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .progress-bar { background-color: #f0f0f0; border-radius: 4px; height: 20px; margin: 10px 0; }
    .progress-bar-fill { background-color: #4CAF50; height: 100%; border-radius: 4px; }
    .card { background-color: #fff; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin: 10px 0; }
    .stat { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 10px 0; }
    .stat-label { font-weight: bold; }
  </style>
</head>
<body>
  <h1>Taskmaster Progress Report</h1>
  <p>Generated on ${new Date().toLocaleString()}</p>
  
  <div class="card">
    <h2>Overall Progress</h2>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${completionRate * 100}%"></div>
    </div>
    <p>${Math.round(completionRate * 100)}% Complete (${completedTasks}/${totalTasks} tasks)</p>
    
    <div class="stat">
      <span class="stat-label">Completed Tasks:</span>
      <span>${completedTasks}</span>
    </div>
    <div class="stat">
      <span class="stat-label">In Progress Tasks:</span>
      <span>${inProgressTasks}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Pending Tasks:</span>
      <span>${pendingTasks}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Estimation Accuracy:</span>
      <span>${Math.round(estimationAccuracy * 100)}%</span>
    </div>
  </div>
  
  <!-- More sections would go here in a full implementation -->
</body>
</html>`;
  } else if (FORMAT === 'json') {
    reportContent = JSON.stringify({
      generatedAt: new Date().toISOString(),
      metrics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        completionRate,
        estimationAccuracy
      },
      tasks,
      history
    }, null, 2);
  } else if (FORMAT === 'md') {
    reportContent = `# Taskmaster Progress Report
Generated on ${new Date().toLocaleString()}

## Overall Progress
${generateProgressBar(completionRate)} (${completedTasks}/${totalTasks} tasks)

- **Completed Tasks:** ${completedTasks}
- **In Progress Tasks:** ${inProgressTasks}
- **Pending Tasks:** ${pendingTasks}
- **Estimation Accuracy:** ${Math.round(estimationAccuracy * 100)}%

## Recent Velocity
${history.weeklyVelocity.map((velocity, index) => `- Week ${index + 1} (${history.weeklyCompletion[index]}): ${velocity} points`).join('\n')}

## Burndown Trend
${history.burndown.map((points, index) => `- Day ${index + 1}: ${points} points remaining`).join('\n')}

<!-- More sections would go here in a full implementation -->
`;
  } else {
    // Console format
    reportContent = `
=======================================
       TASKMASTER PROGRESS REPORT
=======================================
Generated on ${new Date().toLocaleString()}

OVERALL PROGRESS
${generateProgressBar(completionRate)} (${completedTasks}/${totalTasks} tasks)

Completed Tasks:     ${completedTasks}
In Progress Tasks:   ${inProgressTasks}
Pending Tasks:       ${pendingTasks}
Estimation Accuracy: ${Math.round(estimationAccuracy * 100)}%

RECENT VELOCITY
${history.weeklyVelocity.map((velocity, index) => `Week ${index + 1} (${history.weeklyCompletion[index]}): ${velocity} points`).join('\n')}

BURNDOWN TREND
${history.burndown.map((points, index) => `Day ${index + 1}: ${points} points remaining`).join('\n')}
`;
    
    // Print to console
    console.log(reportContent);
  }
  
  // Save to file if specified
  if (OUTPUT_FILE || FORMAT !== 'console') {
    ensureOutputDir();
    const outputPath = OUTPUT_FILE || path.join(config.outputDir, `progress-report.${FORMAT}`);
    fs.writeFileSync(outputPath, reportContent);
    console.log(`Progress report saved to ${outputPath}`);
  }
  
  return reportContent;
}

/**
 * Generate a team performance report
 */
async function generateTeamReport() {
  console.log("Generating team performance report...");
  
  // Get team data and tasks
  const teamJson = await taskmaster('team');
  const tasksJson = await taskmaster('list');
  
  let team = [];
  let tasks = [];
  
  try {
    team = JSON.parse(teamJson);
    tasks = JSON.parse(tasksJson);
  } catch (error) {
    console.error("Failed to parse team data:", error);
  }
  
  // Calculate metrics for each team member
  team.forEach(member => {
    // Get tasks assigned to this team member
    const memberTasks = tasks.filter(task => task.assignedTo === member.id);
    
    // Calculate additional metrics
    member.totalAssigned = memberTasks.length;
    member.completed = memberTasks.filter(task => task.status === 'completed').length;
    member.inProgress = memberTasks.filter(task => task.status === 'in-progress').length;
    member.pending = memberTasks.filter(task => task.status === 'pending').length;
    
    // Calculate on-time completion rate
    const completedTasks = memberTasks.filter(task => task.status === 'completed');
    const onTimeTasks = completedTasks.filter(task => {
      const dueDate = new Date(task.dueDate);
      const completedDate = new Date(task.completedDate);
      return completedDate <= dueDate;
    });
    
    member.onTimeRate = completedTasks.length > 0 ? 
      onTimeTasks.length / completedTasks.length : 0;
  });
  
  // Create report content based on format
  let reportContent = '';
  
  if (FORMAT === 'console') {
    reportContent = `
=======================================
      TASKMASTER TEAM PERFORMANCE
=======================================
Generated on ${new Date().toLocaleString()}

TEAM MEMBERS
${team.map(member => `
${member.name} (${member.role})
Assigned Tasks:   ${member.totalAssigned}
Completed:        ${member.completed}
In Progress:      ${member.inProgress}
Pending:          ${member.pending}
Velocity:         ${member.velocity} points/week
On-Time Rate:     ${Math.round(member.onTimeRate * 100)}%
`).join('\n')}

TEAM SUMMARY
Total Members:    ${team.length}
Avg Velocity:     ${Math.round(team.reduce((sum, m) => sum + m.velocity, 0) / team.length)} points/week
Avg On-Time Rate: ${Math.round(team.reduce((sum, m) => sum + m.onTimeRate, 0) / team.length * 100)}%
`;
    
    // Print to console
    console.log(reportContent);
  }
  
  // Save to file if specified
  if (OUTPUT_FILE || FORMAT !== 'console') {
    ensureOutputDir();
    const outputPath = OUTPUT_FILE || path.join(config.outputDir, `team-report.${FORMAT}`);
    
    // For now, simplified to just save the report content
    fs.writeFileSync(outputPath, reportContent);
    console.log(`Team report saved to ${outputPath}`);
  }
  
  return reportContent;
}

/**
 * Generate a dependency chart
 */
async function generateDependencyChart() {
  console.log("Generating dependency chart...");
  
  // Get tasks
  const tasksJson = await taskmaster('list');
  let tasks = [];
  
  try {
    tasks = JSON.parse(tasksJson);
  } catch (error) {
    console.error("Failed to parse task data:", error);
  }
  
  // For a console-based visualization, we'll use a simple tree-like structure
  const dependencyMap = new Map();
  
  // Create adjacency list representation
  tasks.forEach(task => {
    dependencyMap.set(task.id, {
      id: task.id,
      name: task.name,
      status: task.status,
      dependencies: task.dependencies || [],
      dependents: []
    });
  });
  
  // Fill in dependents (reverse dependencies)
  tasks.forEach(task => {
    if (task.dependencies) {
      task.dependencies.forEach(depId => {
        const depTask = dependencyMap.get(depId);
        if (depTask) {
          depTask.dependents.push(task.id);
        }
      });
    }
  });
  
  // Find root tasks (no dependencies)
  const rootTasks = Array.from(dependencyMap.values())
    .filter(task => task.dependencies.length === 0);
  
  // Build a simple dependency tree
  let treeOutput = '';
  
  function buildTree(taskId, level = 0, visited = new Set()) {
    if (visited.has(taskId)) {
      treeOutput += '  '.repeat(level) + `${taskId} (CIRCULAR REFERENCE)\n`;
      return;
    }
    
    visited.add(taskId);
    const task = dependencyMap.get(taskId);
    
    if (!task) {
      treeOutput += '  '.repeat(level) + `${taskId} (NOT FOUND)\n`;
      return;
    }
    
    const statusIndicator = task.status === 'completed' ? '✓' : 
                           task.status === 'in-progress' ? '◑' : '○';
    
    treeOutput += '  '.repeat(level) + `${statusIndicator} ${task.id}: ${task.name}\n`;
    
    // Process dependents
    task.dependents.forEach(depId => {
      buildTree(depId, level + 1, new Set(visited));
    });
  }
  
  // Build tree starting from each root task
  rootTasks.forEach(rootTask => {
    buildTree(rootTask.id);
    treeOutput += '\n';
  });
  
  // Find critical path (simplified)
  // In a real implementation, this would use a proper algorithm
  const criticalPath = [];
  
  // For this simplified version, we'll just list tasks with the most dependents
  const tasksByDependents = Array.from(dependencyMap.values())
    .sort((a, b) => b.dependents.length - a.dependents.length)
    .slice(0, 5);
  
  // Create report content
  const reportContent = `
=======================================
       TASKMASTER DEPENDENCY CHART
=======================================
Generated on ${new Date().toLocaleString()}

DEPENDENCY TREE
Legend: ✓ = Completed, ◑ = In Progress, ○ = Pending

${treeOutput}

CRITICAL PATH
These tasks have the most dependencies and may cause bottlenecks:

${tasksByDependents.map(task => 
  `${task.id}: ${task.name} (${task.dependents.length} dependent tasks)`
).join('\n')}
`;
  
  // Output based on format
  if (FORMAT === 'console') {
    console.log(reportContent);
  }
  
  // Save to file if specified
  if (OUTPUT_FILE || FORMAT !== 'console') {
    ensureOutputDir();
    const outputPath = OUTPUT_FILE || path.join(config.outputDir, `dependency-chart.${FORMAT}`);
    fs.writeFileSync(outputPath, reportContent);
    console.log(`Dependency chart saved to ${outputPath}`);
  }
  
  return reportContent;
}

/**
 * Generate a completion forecast
 */
async function generateForecastReport() {
  console.log("Generating completion forecast...");
  
  // Get tasks and history
  const tasksJson = await taskmaster('list');
  const historyJson = await taskmaster('history');
  
  let tasks = [];
  let history = { weeklyVelocity: [] };
  
  try {
    tasks = JSON.parse(tasksJson);
    history = JSON.parse(historyJson);
  } catch (error) {
    console.error("Failed to parse task data:", error);
  }
  
  // Calculate team velocity (points per week)
  const recentVelocity = history.weeklyVelocity.slice(-4);
  const avgVelocity = recentVelocity.reduce((sum, v) => sum + v, 0) / recentVelocity.length;
  
  // Calculate remaining work
  const remainingTasks = tasks.filter(task => task.status !== 'completed');
  const remainingPoints = remainingTasks.reduce((sum, task) => {
    // Convert estimated hours to points (simplified 1:1 mapping)
    return sum + (task.estimatedHours || 1);
  }, 0);
  
  // Calculate estimated completion time
  const weeksToComplete = remainingPoints / avgVelocity;
  const daysToComplete = Math.ceil(weeksToComplete * 7);
  
  // Calculate estimated completion date
  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + daysToComplete);
  
  // Generate week-by-week forecast
  const weeklyForecast = [];
  let remainingWork = remainingPoints;
  
  for (let week = 1; remainingWork > 0; week++) {
    const workThisWeek = Math.min(remainingWork, avgVelocity);
    remainingWork -= workThisWeek;
    
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + (week * 7));
    
    weeklyForecast.push({
      week,
      date: forecastDate.toISOString().split('T')[0],
      workCompleted: workThisWeek,
      remainingWork: remainingWork
    });
  }
  
  // Create report content
  const reportContent = `
=======================================
      TASKMASTER COMPLETION FORECAST
=======================================
Generated on ${new Date().toLocaleString()}

FORECAST SUMMARY
Remaining Tasks:       ${remainingTasks.length}
Remaining Work Points: ${remainingPoints.toFixed(1)}
Team Velocity:         ${avgVelocity.toFixed(1)} points/week
Estimated Completion:  ${completionDate.toLocaleDateString()} (in ${daysToComplete} days)

WEEKLY FORECAST
${weeklyForecast.map(week => 
  `Week ${week.week} (${week.date}): ${week.workCompleted.toFixed(1)} points completed, ${week.remainingWork.toFixed(1)} points remaining`
).join('\n')}

RISK ASSESSMENT
${daysToComplete > 30 ? 'HIGH RISK: Completion will take more than a month.' :
  daysToComplete > 14 ? 'MEDIUM RISK: Completion will take more than 2 weeks.' :
  'LOW RISK: Project should complete within 2 weeks.'}
`;
  
  // Output based on format
  if (FORMAT === 'console') {
    console.log(reportContent);
  }
  
  // Save to file if specified
  if (OUTPUT_FILE || FORMAT !== 'console') {
    ensureOutputDir();
    const outputPath = OUTPUT_FILE || path.join(config.outputDir, `forecast-report.${FORMAT}`);
    fs.writeFileSync(outputPath, reportContent);
    console.log(`Forecast report saved to ${outputPath}`);
  }
  
  return reportContent;
}

/**
 * Display interactive menu
 */
async function showMenu() {
  console.log("\n📊 TASKMASTER REPORTER\n");
  console.log("1. Generate Progress Report");
  console.log("2. Generate Team Performance Report");
  console.log("3. Generate Dependency Chart");
  console.log("4. Generate Completion Forecast");
  console.log("5. Set Output Format");
  console.log("0. Exit");
  
  const answer = await new Promise(resolve => {
    rl.question("\nSelect an option: ", resolve);
  });
  
  switch (answer) {
    case '1':
      await generateProgressReport();
      break;
    case '2':
      await generateTeamReport();
      break;
    case '3':
      await generateDependencyChart();
      break;
    case '4':
      await generateForecastReport();
      break;
    case '5':
      { const format = await new Promise(resolve => {
        rl.question("Output format (console, html, json, md): ", resolve);
      });
      if (['console', 'html', 'json', 'md'].includes(format)) {
        FORMAT = format;
        console.log(`Output format set to ${FORMAT}`);
      } else {
        console.log("Invalid format. Using default (console)");
      }
      break; }
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
  if (PROGRESS_REPORT) {
    await generateProgressReport();
  } else if (TEAM_REPORT) {
    await generateTeamReport();
  } else if (DEPENDENCY_CHART) {
    await generateDependencyChart();
  } else if (FORECAST_REPORT) {
    await generateForecastReport();
  } else {
    // Interactive mode
    await showMenu();
  }
}

// Run the main function
main().catch(error => {
  console.error("Error in taskmaster-reporter:", error);
  process.exit(1);
}).finally(() => {
  // Close readline interface if it's open
  if (rl && rl.close) {
    rl.close();
  }
}); 