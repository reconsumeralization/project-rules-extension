#!/usr/bin/env node

/**
 * Taskmaster AI Helper
 * 
 * This script provides AI-powered analysis and assistance for Taskmaster tasks
 * using Google's Generative AI (Gemini).
 * 
 * Usage:
 *   node taskmaster-ai-helper.js <command> [options]
 * 
 * Commands:
 *   analyze-task <taskId>          Analyze a specific task
 *   analyze-all                    Analyze all tasks
 *   breakdown <taskId>             Suggest breakdown for a complex task
 *   prioritize                     Suggest task prioritization
 *   chat                           Start an interactive chat session about tasks
 * 
 * Examples:
 *   node taskmaster-ai-helper.js analyze-task 123456
 *   node taskmaster-ai-helper.js analyze-all
 *   node taskmaster-ai-helper.js breakdown 123456
 *   node taskmaster-ai-helper.js prioritize
 *   node taskmaster-ai-helper.js chat
 * 
 * Environment Variables:
 *   GEMINI_API_KEY                 Required API key for Google Gemini
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const taskmasterStorage = require('./taskmaster-storage');

// Verify API key is available
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is required');
  console.error('Please set your Gemini API key and try again');
  console.error('Example: export GEMINI_API_KEY=your_api_key_here');
  process.exit(1);
}

// Initialize Gemini client (will only proceed if module is installed)
let geminiAI;
try {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiAI = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: "You are a helpful AI assistant for a task management system called TaskMaster. Analyze tasks and provide insights or suggestions."
  });
} catch (error) {
  console.error('Error: @google/generative-ai package is not installed');
  console.error('Please install it with: npm install @google/generative-ai');
  process.exit(1);
}

// Process command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  showHelp();
  process.exit(1);
}

// Main execution
async function main() {
  try {
    switch (command) {
      case 'analyze-task':
        const taskId = args[1];
        if (!taskId) {
          console.error('Error: Task ID required');
          process.exit(1);
        }
        await analyzeTask(taskId);
        break;
        
      case 'analyze-all':
        await analyzeAllTasks();
        break;
        
      case 'breakdown':
        const breakdownTaskId = args[1];
        if (!breakdownTaskId) {
          console.error('Error: Task ID required for breakdown');
          process.exit(1);
        }
        await suggestTaskBreakdown(breakdownTaskId);
        break;
        
      case 'prioritize':
        await suggestPrioritization();
        break;
        
      case 'chat':
        await startChatSession();
        break;
        
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
}

/**
 * Analyze a specific task
 * @param {string} taskId - ID of the task to analyze
 */
async function analyzeTask(taskId) {
  const task = taskmasterStorage.getTaskById(taskId);
  if (!task) {
    console.error(`Error: Task ${taskId} not found`);
    process.exit(1);
  }
  
  // Format prompt for single task analysis
  const prompt = `
Task Analysis Request:

Task: ${task.title}
ID: ${task.id}
Status: ${task.status}
Priority: ${task.priority}
Phase: ${task.phase || 'None'}
Description: ${task.description || 'No description'}

Please provide:
1. Analysis of task complexity and scope
2. Suggestions for breaking down the task (if needed)
3. Recommendations for implementation approach
4. Estimated effort level (low, medium, high)
5. Any potential dependencies or considerations
  `.trim();
  
  await generateAndDisplayResponse(prompt, 'TASK ANALYSIS');
}

/**
 * Analyze all tasks
 */
async function analyzeAllTasks() {
  const tasks = taskmasterStorage.getAllTasks();
  if (!tasks || tasks.length === 0) {
    console.error('Error: No tasks found');
    process.exit(1);
  }
  
  // Format prompt for multiple task analysis
  let prompt = 'Tasks Overview:\n\n';
  tasks.forEach(task => {
    prompt += `- ${task.title} (ID: ${task.id}, Status: ${task.status}, Priority: ${task.priority}, Phase: ${task.phase || 'None'})\n`;
  });
  
  prompt += `
Please provide:
1. Overall assessment of task organization and structure
2. Suggestions for task prioritization
3. Identification of task dependencies or related tasks
4. Recommendations for efficient task completion
5. Any areas of concern or bottlenecks in the current task list
  `.trim();
  
  await generateAndDisplayResponse(prompt, 'TASKS OVERVIEW ANALYSIS');
}

/**
 * Suggest breakdown for a complex task
 * @param {string} taskId - ID of the task to break down
 */
async function suggestTaskBreakdown(taskId) {
  const task = taskmasterStorage.getTaskById(taskId);
  if (!task) {
    console.error(`Error: Task ${taskId} not found`);
    process.exit(1);
  }
  
  // Format prompt for task breakdown
  const prompt = `
Task Breakdown Request:

Task: ${task.title}
ID: ${task.id}
Status: ${task.status}
Priority: ${task.priority}
Phase: ${task.phase || 'None'}
Description: ${task.description || 'No description'}

Please provide a detailed breakdown of this task into smaller, manageable subtasks:
1. Create a list of 3-7 subtasks with clear titles
2. For each subtask, provide a brief description
3. Suggest appropriate priority levels for each subtask
4. Recommend a logical sequence for implementing these subtasks
5. Estimate relative effort for each subtask (small, medium, large)
  `.trim();
  
  await generateAndDisplayResponse(prompt, 'TASK BREAKDOWN SUGGESTIONS');
}

/**
 * Suggest task prioritization
 */
async function suggestPrioritization() {
  const tasks = taskmasterStorage.getAllTasks();
  if (!tasks || tasks.length === 0) {
    console.error('Error: No tasks found');
    process.exit(1);
  }
  
  // Filter only non-completed tasks
  const pendingTasks = tasks.filter(task => task.status !== 'completed');
  if (pendingTasks.length === 0) {
    console.error('Error: No pending tasks found');
    process.exit(1);
  }
  
  // Format prompt for task prioritization
  let prompt = 'Task Prioritization Request:\n\nPending Tasks:\n\n';
  pendingTasks.forEach(task => {
    prompt += `- ${task.title} (ID: ${task.id}, Status: ${task.status}, Priority: ${task.priority}, Phase: ${task.phase || 'None'})\n`;
  });
  
  prompt += `
Please provide:
1. A suggested execution order for these tasks with rationale
2. Identification of any critical tasks that should be addressed immediately
3. Suggestions for task priority adjustments if needed
4. Tasks that could potentially be done in parallel
5. Any recommended changes to task statuses based on dependencies
  `.trim();
  
  await generateAndDisplayResponse(prompt, 'TASK PRIORITIZATION RECOMMENDATIONS');
}

/**
 * Start an interactive chat session about tasks
 */
async function startChatSession() {
  console.log('Starting TaskMaster AI chat session...');
  console.log('Type "exit" or "quit" to end the session\n');
  
  // Get tasks for context
  const tasks = taskmasterStorage.getAllTasks();
  const tasksContext = tasks.map(t => 
    `${t.id}: ${t.title} (${t.status}, ${t.priority}, ${t.phase || 'No phase'})`
  ).join('\n');
  
  // Create chat history with initial system message
  const history = [
    {
      role: "user",
      parts: [{ text: `I'm working with the following tasks in my TaskMaster system:\n\n${tasksContext}\n\nI'd like to discuss these tasks with you and get your insights.` }]
    }
  ];
  
  // Initialize chat session
  const chatSession = geminiAI.startChat({
    history,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
    }
  });
  
  // Display initial response
  try {
    const result = await chatSession.sendMessage("Please help me manage these tasks effectively. What would you like to know first?");
    console.log('\nAI: ' + result.response.text());
  } catch (error) {
    console.error('Error starting chat:', error.message);
    process.exit(1);
  }
  
  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nYou: '
  });
  
  // Start prompting
  rl.prompt();
  
  // Handle user input
  rl.on('line', async (line) => {
    const input = line.trim();
    
    // Check for exit command
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }
    
    try {
      console.log('\nProcessing...');
      const result = await chatSession.sendMessage(input);
      console.log('\nAI: ' + result.response.text());
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    rl.prompt();
  }).on('close', () => {
    console.log('\nEnding chat session. Goodbye!');
    process.exit(0);
  });
}

/**
 * Generate response from Gemini and display it
 * @param {string} prompt - Prompt to send to Gemini
 * @param {string} title - Title for the response display
 */
async function generateAndDisplayResponse(prompt, title) {
  try {
    console.log('Analyzing with AI assistant...');
    
    const result = await geminiAI.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Display the result with a nice separator
    const separator = '='.repeat(80);
    console.log('\n' + separator);
    console.log(title + ':');
    console.log(separator);
    console.log(text);
    console.log(separator);
  } catch (error) {
    console.error('AI Analysis Error:', error.message);
    process.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Taskmaster AI Helper

Usage:
  node taskmaster-ai-helper.js <command> [options]

Commands:
  analyze-task <taskId>          Analyze a specific task
  analyze-all                    Analyze all tasks
  breakdown <taskId>             Suggest breakdown for a complex task
  prioritize                     Suggest task prioritization
  chat                           Start an interactive chat session about tasks
  help                           Show this help message

Examples:
  node taskmaster-ai-helper.js analyze-task 123456
  node taskmaster-ai-helper.js analyze-all
  node taskmaster-ai-helper.js breakdown 123456
  node taskmaster-ai-helper.js prioritize
  node taskmaster-ai-helper.js chat

Environment Variables:
  GEMINI_API_KEY                 Required API key for Google Gemini
  `);
}

// Run the program
main(); 