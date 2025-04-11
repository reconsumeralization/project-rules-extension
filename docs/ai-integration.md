# TaskMaster AI Integration Guide

This guide explains how to use the AI integration capabilities with TaskMaster to get AI-powered insights and assistance with task management.

## Prerequisites

To use the AI features, you'll need:

1. A Google Gemini API key (get one from [Google AI Studio](https://ai.google.dev/))
2. The `@google/generative-ai` package installed in your project
3. The environment variable `GEMINI_API_KEY` set with your API key

## Installation

```bash
# Install the required packages
npm install @google/generative-ai mime-types dotenv --save

# Create a .env file in your project root (recommended)
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Or set your API key as an environment variable
# Linux/macOS
export GEMINI_API_KEY=your_api_key_here

# Windows - PowerShell
$env:GEMINI_API_KEY="your_api_key_here"
```

Make sure to add `.env` to your `.gitignore` file to avoid accidentally committing your API key to version control.

## Testing Your API Key

Before using the AI features, you can verify that your API key is working correctly:

```bash
# Run the simple API test script
node scripts/test-gemini-api.js
```

If successful, you'll see a confirmation message. If not, the script will provide detailed error information.

## Basic AI Integration in TaskMaster CLI

The main TaskMaster CLI has been enhanced with basic AI capabilities:

```bash
# Analyze a specific task with AI
node scripts/taskmaster-storage-cli.js ai-analyze <taskId>

# Analyze all tasks with AI
node scripts/taskmaster-storage-cli.js ai-analyze
```

## Advanced AI Features with the Dedicated Helper

For more advanced AI capabilities, use the dedicated AI helper script:

```bash
# Get help on all available commands
node scripts/taskmaster-ai-helper.js help

# Analyze a specific task
node scripts/taskmaster-ai-helper.js analyze-task <taskId>

# Analyze all tasks in the system
node scripts/taskmaster-ai-helper.js analyze-all

# Get AI suggestions for breaking down a complex task
node scripts/taskmaster-ai-helper.js breakdown <taskId>

# Get AI-powered task prioritization recommendations
node scripts/taskmaster-ai-helper.js prioritize

# Start an interactive chat session with the AI about your tasks
node scripts/taskmaster-ai-helper.js chat
```

## Gemini 2.5 Pro Integration with Code Execution

For the most advanced AI capabilities, including code execution, use the Gemini 2.5 proxy script:

```bash
# Get help on all available commands
node scripts/taskmaster-gemini-proxy.js help

# Start an interactive chat session about all tasks or a specific task
node scripts/taskmaster-gemini-proxy.js chat [taskId]

# Get AI to suggest and execute code for implementing a task
node scripts/taskmaster-gemini-proxy.js execute <taskId>

# Get comprehensive task analysis using the latest Gemini model
node scripts/taskmaster-gemini-proxy.js analyze <taskId>
```

The Gemini 2.5 proxy provides enhanced capabilities:

- **Code Execution**: AI can suggest and execute code related to your tasks
- **Interactive Chat**: More advanced chat with better context understanding
- **More Detailed Analysis**: Comprehensive task analysis with the latest model
- **Media Support**: Can generate and display images or other media if needed

## Example Workflow

Here's a typical workflow using the AI features:

1. List your tasks to find the one you want to analyze

   ```bash
   node scripts/taskmaster-storage-cli.js list --format
   ```

2. Analyze a specific task in detail

   ```bash
   node scripts/taskmaster-ai-helper.js analyze-task 16645323
   ```

3. For a complex task, get suggestions on breaking it down

   ```bash
   node scripts/taskmaster-ai-helper.js breakdown 16645323
   ```

4. Create subtasks based on the AI recommendations

   ```bash
   node scripts/taskmaster-storage-cli.js create "Subtask 1" "Description" "high" "16645323"
   ```

5. Get AI-powered prioritization advice for all your tasks

   ```bash
   node scripts/taskmaster-ai-helper.js prioritize
   ```

6. Start an interactive chat session for more complex discussions

   ```bash
   node scripts/taskmaster-ai-helper.js chat
   ```

7. Use Gemini 2.5 for advanced implementation help with code execution

   ```bash
   node scripts/taskmaster-gemini-proxy.js execute 16645323
   ```

## Choosing the Right AI Tool

TaskMaster offers three levels of AI integration:

1. **Basic Integration** (taskmaster-storage-cli.js) - Simple analysis for quick insights
2. **Advanced Helper** (taskmaster-ai-helper.js) - Detailed analysis and specialized features
3. **Gemini 2.5 Proxy** (taskmaster-gemini-proxy.js) - Most advanced features with code execution

Choose based on your needs:

| Feature | Basic | Advanced | Gemini 2.5 |
|---------|-------|----------|------------|
| Task Analysis | ✓ | ✓ | ✓ |
| Task Breakdown | - | ✓ | ✓ |
| Prioritization | - | ✓ | ✓ |
| Interactive Chat | - | ✓ | ✓ |
| Code Execution | - | - | ✓ |
| Media Generation | - | - | ✓ |
| Model Version | 1.5 Pro | 1.5 Pro | 2.5 Pro |

## Supported Features

The AI helpers provide these key capabilities:

- **Task analysis**: Get insights on task complexity, scope, and approach
- **Task breakdown**: Suggestions for splitting complex tasks into manageable subtasks
- **Prioritization**: Get recommendations on task execution order
- **Interactive chat**: Discuss your tasks with the AI assistant for deeper insights
- **Status recommendations**: Get suggestions about task status changes
- **Dependency analysis**: Identify potential dependencies between tasks
- **Code generation**: (Gemini 2.5 only) Get code to implement specific tasks
- **Code execution**: (Gemini 2.5 only) Execute and test the suggested code

## Customization

The AI prompts can be customized by modifying the prompt templates in:

- `scripts/taskmaster-storage-cli.js` - For basic AI integration
- `scripts/taskmaster-ai-helper.js` - For advanced AI features
- `scripts/taskmaster-gemini-proxy.js` - For Gemini 2.5 features with code execution

## Notes and Limitations

- You must have a valid Gemini API key for the features to work
- Response quality depends on the detail in your task descriptions
- The AI features work best with a reasonable number of tasks (5-20)
- For large task sets, consider filtering before analysis
- Internet connectivity is required as the features use Google's API
- Code execution features in Gemini 2.5 may have security implications - review any code before allowing execution

## Troubleshooting

If you encounter issues with the AI integration:

1. Verify your API key is set correctly
2. Check that the `@google/generative-ai` package is installed
3. For Gemini 2.5 features, ensure `mime-types` is also installed
4. Ensure your task storage is properly initialized
5. Verify your internet connection
6. Check for any quota limits on your Gemini API key
