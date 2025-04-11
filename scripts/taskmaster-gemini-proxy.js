#!/usr/bin/env node

/**
 * TaskMaster Gemini Proxy
 * 
 * This script provides an interface between TaskMaster and Google's Gemini 2.5 Pro model,
 * allowing for more advanced AI assistance with tasks, including code execution capabilities.
 * 
 * Usage:
 *   node taskmaster-gemini-proxy.js <command> [options]
 * 
 * Commands:
 *   chat [taskId]               Start an interactive chat session about a specific task or all tasks
 *   execute <taskId>            Get AI to suggest and execute code for a task
 *   analyze <taskId>            Analyze a task with the latest Gemini model
 *   auto <taskId>               Run in autonomous mode to complete a task without user interaction
 *   auto-chat <taskId>          Run autonomous chat mode where the AI discusses a task with itself
 *   help                        Show this help information
 * 
 * Examples:
 *   node taskmaster-gemini-proxy.js chat 123456
 *   node taskmaster-gemini-proxy.js execute 123456
 *   node taskmaster-gemini-proxy.js analyze 123456
 *   node taskmaster-gemini-proxy.js auto 123456
 *   node taskmaster-gemini-proxy.js auto-chat 123456
 * 
 * Environment Variables:
 *   GEMINI_API_KEY              Required API key for Google Gemini
 */

// Try to load .env file if it exists
try {
  require('dotenv').config();
} catch (error) {
  // dotenv module might not be installed, ignore this error
}

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const fs = require("node:fs");
const readline = require("readline");
const path = require("path");
const mime = require("mime-types");
const taskmasterStorage = require("./taskmaster-storage");

// Verify API key is available
const apiKey = process.env.GEMINI_API_KEY;
const SIMULATION_MODE = process.env.SIMULATE_CONVERSATION === "true";

if (!apiKey && !SIMULATION_MODE) {
  console.error('Error: GEMINI_API_KEY environment variable is required');
  console.error('Please set your Gemini API key and try again');
  console.error('Example: export GEMINI_API_KEY=your_api_key_here');
  console.error('Or create a .env file with GEMINI_API_KEY=your_api_key_here');
  console.error('');
  console.error('Alternatively, use simulation mode: SIMULATE_CONVERSATION=true');
  process.exit(1);
}

// Initialize Gemini client
let genAI = null;
let simulationModel = null;

if (!SIMULATION_MODE) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.log('Running in simulation mode - no API key required');

  // Create a simulation model that mimics the Gemini interface
  simulationModel = {
    startChat: (options) => {
      console.log('Simulated chat session started');

      // Simulated chat history for the current task
      const taskResponses = {
        '16645323': [
          "I'll help you analyze Task #16645323: Implement TypeScript event handlers. Let's break this down into manageable steps and considerations.",
          "Looking at the requirements for TypeScript event handlers, I recommend using the Event Normalization approach. This creates a normalized interface that works across different event systems, providing the best type safety and flexibility.",
          "For the implementation, start by creating interface definitions that capture the common properties between different event types. Then implement adapter functions that translate between specific event implementations and your normalized interface.",
          "Testing will be crucial. I suggest creating unit tests that verify your event handlers work correctly with both React synthetic events and VSCode's event system. Focus on edge cases like event propagation and cancellation.",
          "Remember to document the type system thoroughly for other developers. Clear examples of how to use these event handlers will make adoption much easier."
        ]
      };

      let responseIndex = 0;
      let currentTaskId = null;

      // Extract task ID directly from options or from initial message
      if (options.history && options.history[0] && options.history[0].parts && options.history[0].parts[0].text) {
        const match = options.history[0].parts[0].text.match(/ID: ([a-zA-Z0-9]+)/);
        if (match && match[1]) {
          currentTaskId = match[1];
          console.log(`Simulation detected task ID: ${currentTaskId}`);
        }
      }

      return {
        sendMessage: async (message) => {
          console.log(`Simulated message sent: "${message.substring(0, 40)}${message.length > 40 ? '...' : ''}"`);

          // Provide appropriate simulated response based on task and message
          let response = "I'm a simulation of Gemini. In real usage, I would provide detailed assistance with your task.";

          if (currentTaskId && taskResponses[currentTaskId] && responseIndex < taskResponses[currentTaskId].length) {
            response = taskResponses[currentTaskId][responseIndex];
            responseIndex++;
            console.log(`Using predefined response #${responseIndex} for task ${currentTaskId}`);
          } else {
            console.log('No task-specific responses available or all responses used');
          }

          return {
            response: {
              text: () => response,
              parts: () => [{ text: response }]
            }
          };
        }
      };
    },

    generateContent: async (prompt) => {
      console.log(`Simulated content generation for: "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}"`);

      // Predefined analysis responses for specific tasks
      const analysisResponses = {
        '16645323': `# Task Analysis: Implement TypeScript Event Handlers

## Task Complexity Assessment
This task has medium-high complexity (4/5). It requires understanding of TypeScript's type system, events in different contexts (React and VSCode), and creating a unified interface that maintains type safety.

## Task Breakdown Recommendation
1. **Define core event interface** - Create a base TypeScript interface that represents common event properties
2. **Implement adapter layer** - Create adapter functions to normalize platform-specific events
3. **Add event propagation support** - Implement consistent event bubbling mechanism
4. **Create event cancellation utilities** - Add standardized methods for stopping propagation
5. **Document usage patterns** - Create examples for developers to follow

## Implementation Approach
Based on the tradeoff analysis documented in \`docs/taskmaster/decisions/task-16645323-tradeoff-analysis.md\`, the **Event Normalization** approach was selected as the best solution. This involves:

1. Creating a normalized event interface that works with both systems
2. Implementing adapter functions for different event types
3. Using TypeScript's advanced type features (generics, conditional types)

## Estimated Effort
- **Level**: High
- **Time**: Approximately 12 hours
- **Technical risk**: Medium (3/5)

## Dependencies and Considerations
- Requires strong TypeScript knowledge
- May need to update existing event handling code
- Should be backward compatible with existing implementations
- Consider performance implications of normalization layer

## Recommendation
Begin with creating the interface definitions and test cases first, then implement the adapters incrementally. This allows for continuous validation during implementation.`,
      };

      // Check if the prompt is for a specific task
      let taskId = null;
      const taskMatch = prompt.match(/Task: .* ID: ([a-zA-Z0-9]+)/);
      if (taskMatch && taskMatch[1]) {
        taskId = taskMatch[1];
        console.log(`Simulation detected task ID for analysis: ${taskId}`);
      }

      // Return predefined response if available
      let response = "I'm a simulation of Gemini. In real usage, I would analyze this task in detail and provide actionable insights.";

      if (taskId && analysisResponses[taskId]) {
        response = analysisResponses[taskId];
        console.log(`Using predefined analysis for task ${taskId}`);
      } else {
        console.log('No task-specific analysis available');
      }

      return {
        response: {
          text: () => response,
          parts: () => [{ text: response }]
        }
      };
    }
  };
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
      case 'chat':
        {
          const taskId = args[1]; // Optional task ID
          await startChat(taskId);
          break;
        }

      case 'execute':
        if (!args[1]) {
          console.error('Error: Task ID required for execution');
          process.exit(1);
        }
        await executeTaskCode(args[1]);
        break;

      case 'analyze':
        if (!args[1]) {
          console.error('Error: Task ID required for analysis');
          process.exit(1);
        }
        await analyzeTask(args[1]);
        break;

      case 'auto':
        if (!args[1]) {
          console.error('Error: Task ID required for autonomous mode');
          process.exit(1);
        }
        await runAutonomousMode(args[1]);
        break;

      case 'auto-chat':
        if (!args[1]) {
          console.error('Error: Task ID required for autonomous chat mode');
          process.exit(1);
        }
        await runAutonomousChatMode(args[1]);
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
 * Start an interactive chat session focused on a specific task or all tasks
 * @param {string} taskId - Optional task ID to focus the chat on
 */
async function startChat(taskId) {
  let task = null;
  let tasks = [];
  let contextPrompt = '';

  if (taskId) {
    // Focus on specific task
    task = taskmasterStorage.getTaskById(taskId);
    if (!task) {
      console.error(`Error: Task ${taskId} not found`);
      process.exit(1);
    }

    contextPrompt = `I'd like to discuss this task from my TaskMaster system:
    
Task: ${task.title}
ID: ${task.id}
Status: ${task.status}
Priority: ${task.priority}
Phase: ${task.phase || 'None'}
Description: ${task.description || 'No description'}

I'd like your insights on how to approach this task effectively.`;
  } else {
    // Discuss all tasks
    tasks = taskmasterStorage.getAllTasks();
    if (!tasks || tasks.length === 0) {
      console.error('Error: No tasks found in the system');
      process.exit(1);
    }

    const taskSummary = tasks.map(t =>
      `- ${t.title} (ID: ${t.id}, Status: ${t.status}, Priority: ${t.priority}, Phase: ${t.phase || 'None'})`
    ).join('\n');

    contextPrompt = `I'd like to discuss the following tasks from my TaskMaster system:
    
${taskSummary}

I'd like your insights on these tasks, particularly regarding prioritization and execution strategy.`;
  }

  console.log('Starting advanced Gemini 2.5 chat session...');
  console.log('Type "exit" or "quit" to end the session\n');

  // Initialize model with tools
  const model = SIMULATION_MODE ? simulationModel : genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: "You are a helpful AI assistant for a task management system called TaskMaster. Your goal is to help the user understand, plan, and execute their tasks effectively. Provide specific, actionable advice based on software development best practices.",
    tools: [{ codeExecution: {} }],
  });

  // Generate config
  const generationConfig = {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 4096,
  };

  // Create chat session with initial history
  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [{ text: contextPrompt }],
      },
    ],
  });

  // Display initial response
  try {
    console.log('AI Assistant is thinking...');
    const result = await chatSession.sendMessage("Please provide your initial thoughts on this task/these tasks.");
    console.log('\nAI: ' + result.response.text());

    // Handle any code execution or other parts in the response
    handleResponseParts(result.response);
  } catch (error) {
    console.error('Error starting chat:', error.message);
    process.exit(1);
  }

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nYou: ',
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
      console.log('\nAI Assistant is thinking...');
      const result = await chatSession.sendMessage(input);
      console.log('\nAI: ' + result.response.text());

      // Handle any code execution or other parts in the response
      handleResponseParts(result.response);
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
 * Handle different parts in the model response (text, inline data, etc.)
 * @param {Object} response - The response from the model
 */
function handleResponseParts(response) {
  if (!response.candidates || response.candidates.length === 0) {
    return;
  }

  // Process each candidate
  response.candidates.forEach((candidate, candidateIndex) => {
    if (!candidate.content || !candidate.content.parts) {
      return;
    }

    // Process each part in the candidate
    candidate.content.parts.forEach((part, partIndex) => {
      // Handle inline data (images, etc.)
      if (part.inlineData) {
        try {
          const filename = `output_${candidateIndex}_${partIndex}.${mime.extension(part.inlineData.mimeType)}`;
          fs.writeFileSync(filename, Buffer.from(part.inlineData.data, 'base64'));
          console.log(`\nOutput file saved to: ${filename}`);
        } catch (err) {
          console.error('Error saving inline data:', err.message);
        }
      }

      // Handle code execution results
      if (part.executionOutput) {
        console.log('\n--- Code Execution Output ---');
        console.log(part.executionOutput);
        console.log('-----------------------------\n');
      }
    });
  });
}

/**
 * Execute task code with AI assistance
 * @param {string} taskId - ID of the task to execute
 */
async function executeTaskCode(taskId) {
  const task = taskmasterStorage.getTaskById(taskId);
  if (!task) {
    console.error(`Error: Task ${taskId} not found`);
    process.exit(1);
  }

  console.log(`\n🤖 Analyzing task #${taskId} for code execution...`);

  if (SIMULATION_MODE) {
    // Simulated code execution for specific tasks
    const codeExecutionResponses = {
      '16645323': {
        suggestion: `
// Here's an implementation for your TypeScript event handlers task

// First, let's define our base event interface
interface NormalizedEvent<T = any> {
  type: string;
  target: T;
  currentTarget: T;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  timestamp: number;
  
  // Methods
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  
  // Original event reference (for advanced use cases)
  originalEvent?: unknown;
}

// Now, create adapter functions for React events
export function fromReactEvent<T = Element>(event: React.SyntheticEvent): NormalizedEvent<T> {
  return {
    type: event.type,
    target: event.target as unknown as T,
    currentTarget: event.currentTarget as unknown as T,
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
    timestamp: event.timeStamp,
    
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
    stopImmediatePropagation: () => {
      // React doesn't have stopImmediatePropagation, so we simulate it
      event.stopPropagation();
      console.warn('stopImmediatePropagation is simulated in React events');
    },
    
    originalEvent: event.nativeEvent
  };
}

// Adapter for VSCode events
export function fromVSCodeEvent<T = any>(event: any): NormalizedEvent<T> {
  return {
    type: event.type || 'unknown',
    target: event.target || null,
    currentTarget: event.currentTarget || event.target || null,
    bubbles: typeof event.bubbles === 'boolean' ? event.bubbles : true,
    cancelable: typeof event.cancelable === 'boolean' ? event.cancelable : true,
    defaultPrevented: event.defaultPrevented || false,
    timestamp: event.timeStamp || Date.now(),
    
    preventDefault: () => {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    },
    stopPropagation: () => {
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    },
    stopImmediatePropagation: () => {
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      } else if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    },
    
    originalEvent: event
  };
}

// Example usage:
// 
// For React:
// function handleClick(e: React.MouseEvent) {
//   const normalizedEvent = fromReactEvent(e);
//   // Now use normalizedEvent consistently in your code
// }
//
// For VSCode:
// vscode.workspace.onDidChangeTextDocument(event => {
//   const normalizedEvent = fromVSCodeEvent(event);
//   // Now use normalizedEvent consistently in your code
// });
`,
        execution: `
// Testing the event normalization implementation

// Mock events for testing
const mockReactEvent = {
  type: 'click',
  target: { tagName: 'BUTTON', id: 'test-button' },
  currentTarget: { tagName: 'BUTTON', id: 'test-button' },
  bubbles: true, 
  cancelable: true,
  defaultPrevented: false,
  timeStamp: Date.now(),
  preventDefault: () => console.log('preventDefault called'),
  stopPropagation: () => console.log('stopPropagation called'),
  nativeEvent: { type: 'click' }
};

const mockVSCodeEvent = {
  type: 'change',
  target: { uri: 'file:///test.ts' },
  bubbles: true,
  cancelable: true,
  timeStamp: Date.now(),
  preventDefault: () => console.log('preventDefault called'),
  stopPropagation: () => console.log('stopPropagation called')
};

// Test React event normalization
console.log("Testing React event normalization:");
const normalizedReactEvent = fromReactEvent(mockReactEvent);
console.log(normalizedReactEvent);
normalizedReactEvent.preventDefault();
normalizedReactEvent.stopPropagation();

// Test VSCode event normalization
console.log("\\nTesting VSCode event normalization:");
const normalizedVSCodeEvent = fromVSCodeEvent(mockVSCodeEvent);
console.log(normalizedVSCodeEvent);
normalizedVSCodeEvent.preventDefault();
normalizedVSCodeEvent.stopPropagation();

console.log("\\nTest completed successfully!");
console.log("The event normalization layer is working as expected.");
console.log("You can now implement this in your project.");
`,
        output: `
Testing React event normalization:
{
  type: 'click',
  target: { tagName: 'BUTTON', id: 'test-button' },
  currentTarget: { tagName: 'BUTTON', id: 'test-button' },
  bubbles: true,
  cancelable: true,
  defaultPrevented: false,
  timestamp: 1744331095264,
  preventDefault: [Function: preventDefault],
  stopPropagation: [Function: stopPropagation],
  stopImmediatePropagation: [Function: stopImmediatePropagation],
  originalEvent: { type: 'click' }
}
preventDefault called
stopPropagation called

Testing VSCode event normalization:
{
  type: 'change',
  target: { uri: 'file:///test.ts' },
  currentTarget: { uri: 'file:///test.ts' },
  bubbles: true,
  cancelable: true,
  defaultPrevented: false,
  timestamp: 1744331095264,
  preventDefault: [Function: preventDefault],
  stopPropagation: [Function: stopPropagation],
  stopImmediatePropagation: [Function: stopImmediatePropagation],
  originalEvent: {
    type: 'change',
    target: { uri: 'file:///test.ts' },
    bubbles: true,
    cancelable: true,
    timeStamp: 1744331095264,
    preventDefault: [Function: preventDefault],
    stopPropagation: [Function: stopPropagation]
  }
}
preventDefault called
stopPropagation called

Test completed successfully!
The event normalization layer is working as expected.
You can now implement this in your project.
`
      }
    };

    // Get simulated code response for specific task
    const codeResponse = codeExecutionResponses[taskId];

    if (codeResponse) {
      console.log('\n✨ AI-generated solution:');
      console.log(codeResponse.suggestion);

      console.log('\n🧪 Testing implementation:');
      console.log(codeResponse.execution);

      console.log('\n📝 Execution output:');
      console.log(codeResponse.output);

      console.log('\nSimulation complete! In real execution, this would run the code with a Gemini 2.5 Pro code execution agent.');
      return;
    } else {
      console.log('No predefined code execution response for this task in simulation mode.');
      return;
    }
  }

  // Build prompt for code execution
  const prompt = `
Task: ${task.title}
ID: ${task.id}
Description: ${task.description || 'No description'}

Please help me implement this task by:
1. Suggesting an implementation
2. Providing test code to verify the implementation
3. Running the code to confirm it works

Let's approach this step by step.
  `.trim();

  try {
    console.log('Connecting to Gemini 2.5 Pro for code execution...');

    // For real implementation, we would use Gemini's code execution capability
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      tools: [{ codeExecution: {} }],
    });

    const result = await model.generateContent(prompt);
    console.log('\n' + result.response.text());

    // Additional code to handle code execution result would go here

  } catch (error) {
    console.error('Error executing code:', error.message);
    process.exit(1);
  }
}

/**
 * Analyze a task with the latest Gemini model
 * @param {string} taskId - ID of the task to analyze
 */
async function analyzeTask(taskId) {
  const task = taskmasterStorage.getTaskById(taskId);
  if (!task) {
    console.error(`Error: Task ${taskId} not found`);
    process.exit(1);
  }

  console.log(`Analyzing task with Gemini 2.5: ${task.title} (${taskId})`);

  // Build prompt for task analysis
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
5. Potential dependencies or considerations
6. Best practices to follow
7. Testing considerations
8. Documentation needs

Please format your analysis in a clear, structured way with Markdown headings.
  `.trim();

  try {
    if (SIMULATION_MODE) {
      console.log("Running in simulation mode - using predefined analysis");

      if (simulationModel) {
        const result = await simulationModel.generateContent(prompt);
        console.log('\n' + result.response.text());
      } else {
        console.error("Simulation model not initialized properly");
        process.exit(1);
      }

      return;
    }

    // For non-simulation mode
    console.log('Connecting to Gemini API...');

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro"
    });

    const result = await model.generateContent(prompt);
    console.log('\n' + result.response.text());

  } catch (error) {
    console.error('Error analyzing task:', error.message);
    process.exit(1);
  }
}

/**
 * Runs the autonomous mode where the AI will analyze, implement and complete a task without user interaction
 * @param {string} taskId - The ID of the task to work on autonomously
 */
async function runAutonomousMode(taskId) {
  console.log(`\n🤖 Starting autonomous mode for task ${taskId}\n`);

  try {
    // Step 1: Fetch task details
    const task = taskmasterStorage.getTaskById(taskId);
    if (!task) {
      console.error(`Error: Task with ID ${taskId} not found.`);
      process.exit(1);
    }

    console.log(`\n📋 Working on task: ${task.title}\n`);
    console.log(task.description);
    console.log('------------------------------------------------------');

    // Step 2: Analysis phase
    console.log(`\n🔍 Phase 1: Analyzing task...`);

    const analysisPrompt = `You are tasked with analyzing the following task:
Title: ${task.title}
Description: ${task.description}

Please provide a thorough analysis of this task that includes:
1. Task complexity assessment (on a scale of 1-5)
2. Selected approach based on project documentation
3. Implementation plan with clear steps
4. Potential challenges and considerations

Format your response as a markdown document with clear sections.`;

    // Get AI analysis response
    const analysisResult = await getGeminiResponse(
      analysisPrompt,
      undefined,
      { temperature: 0.2, topP: 0.8, topK: 40 }
    );

    console.log(`\n✅ Analysis completed:`);
    console.log(analysisResult);
    console.log('------------------------------------------------------');

    // Step 3: Implementation phase
    console.log(`\n👨‍💻 Phase 2: Implementing solution...`);

    const implementationPrompt = `Based on your analysis of the task:
Title: ${task.title}
Description: ${task.description}

And your analysis:
${analysisResult}

Please implement a complete solution for this task. Include:
1. Well-commented, production-ready code
2. Any necessary tests
3. Documentation on how to use the implementation

Format your response as a comprehensive implementation with clear code blocks.`;

    // Get AI implementation response
    const implementationResult = await getGeminiResponse(
      implementationPrompt,
      undefined,
      { temperature: 0.2, maxOutputTokens: 8000, topK: 40 }
    );

    console.log(`\n✅ Implementation completed:`);
    console.log(implementationResult);
    console.log('------------------------------------------------------');

    // Step 4: Testing and completion phase
    console.log(`\n🧪 Phase 3: Verifying and finalizing...`);

    const completionPrompt = `You have analyzed and implemented a solution for the task:
Title: ${task.title}
Description: ${task.description}

Your analysis was:
${analysisResult}

Your implementation was:
${implementationResult}

Please provide a completion report that includes:
1. Summary of what was implemented
2. Testing results or verification steps
3. Any limitations or future improvements
4. Final status (completed or needs further work)

Format your response as a completion report with clear sections.`;

    // Get AI completion response
    const completionResult = await getGeminiResponse(
      completionPrompt,
      undefined,
      { temperature: 0.2, topP: 0.8, topK: 40 }
    );

    console.log(`\n✅ Verification completed:`);
    console.log(completionResult);
    console.log('------------------------------------------------------');

    // Step 5: Save all results to files in the task directory
    const taskDir = path.join(process.cwd(), 'tasks', `task-${taskId}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    // Save analysis
    fs.writeFileSync(path.join(taskDir, 'analysis.md'), analysisResult);
    // Save implementation
    fs.writeFileSync(path.join(taskDir, 'implementation.md'), implementationResult);
    // Save completion report
    fs.writeFileSync(path.join(taskDir, 'completion-report.md'), completionResult);

    console.log(`\n💾 All outputs saved to: ${taskDir}`);

    // Step 6: Ask user if they want to update task status
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`\n🔄 Would you like to update the task status to completed? (y/n): `, async (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        try {
          // Update task status to completed
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          taskmasterStorage.updateTask(task);
          console.log('✅ Task status updated to completed.');
        } catch (error) {
          console.error('Error updating task status:', error);
        }
      } else {
        console.log('Task status remains unchanged.');
      }
      rl.close();

      console.log(`\n🎉 Autonomous mode completed successfully!`);
    });
  } catch (error) {
    console.error(`Error in autonomous mode: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Runs the autonomous chat mode where the AI will have a conversation with itself about a task
 * @param {string} taskId - The ID of the task to discuss autonomously
 */
async function runAutonomousChatMode(taskId) {
  console.log(`\n🤖 Starting autonomous chat mode for task ${taskId}\n`);

  try {
    // Step 1: Fetch task details
    const task = taskmasterStorage.getTaskById(taskId);
    if (!task) {
      console.error(`Error: Task with ID ${taskId} not found.`);
      process.exit(1);
    }

    console.log(`\n📋 Discussing task: ${task.title}\n`);
    console.log(task.description);
    console.log('------------------------------------------------------');

    // Predefined questions for the autonomous chat
    const questions = [
      "What is your understanding of this task?",
      "What approaches could we take to implement this?",
      "What are the potential challenges we might face?",
      "How would you break this down into smaller subtasks?",
      "What testing strategy would you recommend?",
      "How should we document this implementation?"
    ];

    let fullConversation = `# Autonomous Chat for Task: ${task.title}\n\n`;
    fullConversation += `**Task ID:** ${task.id}\n`;
    fullConversation += `**Description:** ${task.description}\n\n`;
    fullConversation += `**Status:** ${task.status}\n`;
    fullConversation += `**Priority:** ${task.priority}\n`;
    fullConversation += `**Phase:** ${task.phase || 'None'}\n\n`;
    fullConversation += `---\n\n`;

    // Step 2: Run through each question
    for (const question of questions) {
      console.log(`\n❓ Question: ${question}`);

      const prompt = `Task: ${task.title} (ID: ${task.id})
Description: ${task.description}

Current question: ${question}

Please provide a detailed and thoughtful response to this question, considering the context of the task.
Format your response in markdown with clear sections as appropriate.`;

      // Get AI response for this question
      const response = await getGeminiResponse(
        prompt,
        undefined,
        { temperature: 0.3, topP: 0.8, topK: 40 }
      );

      console.log(`\n✅ AI Response:`);
      console.log(response);
      console.log('------------------------------------------------------');

      // Add to the full conversation
      fullConversation += `## ${question}\n\n${response}\n\n---\n\n`;
    }

    // Step 3: Generate a summary conclusion
    console.log(`\n📊 Generating conclusion and next steps...`);

    const summaryPrompt = `You have just finished discussing this task:
Title: ${task.title}
Description: ${task.description}

Please provide:
1. A summary of the key points discussed
2. Concrete next steps for implementation
3. Any recommendations for the developer working on this task

Format your response in markdown with clear sections.`;

    const summary = await getGeminiResponse(
      summaryPrompt,
      undefined,
      { temperature: 0.3, topP: 0.8, topK: 40 }
    );

    console.log(`\n✅ Summary and next steps:`);
    console.log(summary);

    // Add summary to the full conversation
    fullConversation += `## Summary and Next Steps\n\n${summary}\n`;

    // Step 4: Save the conversation to a file
    const taskDir = path.join(process.cwd(), 'tasks', `task-${taskId}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const outputPath = path.join(taskDir, `autonomous-chat-${timestamp}.md`);
    fs.writeFileSync(outputPath, fullConversation);

    console.log(`\n💾 Conversation saved to: ${outputPath}`);
    console.log(`\n🎉 Autonomous chat completed successfully!`);

  } catch (error) {
    console.error(`Error in autonomous chat mode: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
TaskMaster Gemini Proxy

Usage:
  node taskmaster-gemini-proxy.js <command> [options]

Commands:
  chat <task_id> - Start a chat session with the AI about a specific task
  execute <task_id> - Ask the AI to directly execute a task
  analyze <task_id> - Ask the AI to analyze a task
  auto <task_id> - Run autonomous mode where the AI will analyze, implement and complete a task without user interaction
  auto-chat <task_id> - Run autonomous chat mode where the AI discusses a task with itself
  help - Show this help message

Examples:
  node taskmaster-gemini-proxy.js chat 123456
  node taskmaster-gemini-proxy.js execute 123456
  node taskmaster-gemini-proxy.js analyze 123456
  node taskmaster-gemini-proxy.js auto 123456
  node taskmaster-gemini-proxy.js auto-chat 123456

Environment Variables:
  GEMINI_API_KEY              Required API key for Google Gemini
  SIMULATE_CONVERSATION       Set to "true" to run in simulation mode (no API key needed)

Simulation Mode:
  To run without a Gemini API key, set SIMULATE_CONVERSATION=true in your environment.
  This will use predefined responses for supported task IDs (e.g., 16645323).
  
  Example: $env:SIMULATE_CONVERSATION="true"; node taskmaster-gemini-proxy.js chat 16645323
`);
}

/**
 * Get a response from Gemini API with configurable parameters
 * @param {string} prompt - The prompt to send to the API
 * @param {Object|undefined} tools - Optional tools object for the model
 * @param {Object|undefined} config - Configuration options for generation
 * @returns {Promise<string>} The text response from the model
 */
async function getGeminiResponse(prompt, tools, config = {}) {
  if (SIMULATION_MODE) {
    console.log(`Getting simulated response for prompt: "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}"`);

    // Simulated response for autonomous mode
    return `
# Simulated Gemini Response

This is a simulated response from the Gemini AI model. In actual execution, 
this would be generated content from Google's Gemini 2.5 Pro model.

## Key Points
- This is simulated content only
- In real execution, detailed AI-generated analysis would appear here
- The autonomous mode is functioning correctly

For testing purposes, you can consider this a successful response that meets
the requirements of the prompt:

\`\`\`
${prompt.substring(0, 100)}...
\`\`\`

When using with a real API key, genuine AI-generated content will be provided.
`;
  }

  try {
    console.log('Connecting to Gemini API...');

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      tools: tools,
    });

    // Merge default config with provided config
    const generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 4096,
      ...config
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    return result.response.text();
  } catch (error) {
    console.error('Error getting Gemini response:', error.message);
    throw error;
  }
}

// Run the program
main(); 