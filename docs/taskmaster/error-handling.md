# Taskmaster Error Handling

This document details the error handling approach used in Taskmaster scripts and provides guidance for troubleshooting common issues.

## Overview

The Taskmaster system implements consistent error handling patterns across all its scripts to ensure reliability and provide clear feedback when issues occur.

## Common Error Scenarios

### Command Execution Errors

In `taskmaster-workflow.js`, `taskmaster-enhanced.js`, and `taskmaster-autonomous.js`, command execution errors are handled in the `runCommand` function:

```javascript
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
```

When a command fails to execute, the error is logged to the console and the promise is rejected, allowing calling functions to implement appropriate fallback behavior.

### Taskmaster Command Simulation Errors

In the `taskmaster` function, errors during command simulation are handled:

```javascript
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
      
      // Simulation logic...
      
      return 'Command executed successfully';
    }
  } catch (error) {
    console.error(`Failed to execute taskmaster command: ${error}`);
    return null;
  }
}
```

If the taskmaster command fails, the error is logged and `null` is returned, allowing calling code to detect and handle the failure.

### MCP Server Connection Errors

In both enhanced and autonomous versions, MCP server connection errors are handled with fallback to local operation:

```javascript
async function connectToMcpServer() {
  console.log("\n🔌 Connecting to MCP Server...");
  
  try {
    // Connection logic...
    return { status: "connected", agents: [...] };
  } catch (error) {
    console.error("Failed to connect to MCP Server:", error);
    return { status: "disconnected", error: error.message };
  }
}
```

When MCP connection fails, the system will continue to operate using local functionality, ensuring tasks can still be managed even without AI assistance.

### Task Analysis Errors

During task analysis and breakdown, errors are handled to prevent workflow disruption:

```javascript
async function analyzeAndExpandTask(taskId) {
  try {
    // Task analysis logic...
  } catch (error) {
    console.error(`Error analyzing task #${taskId}: ${error.message}`);
    console.log("Falling back to manual task breakdown...");
    
    // Fallback to basic task expansion
    return await enhancedExpandTask(taskId);
  }
}
```

## Error Recovery Strategies

### Progressive Fallback

Taskmaster implements a progressive fallback strategy:

1. First attempt: Full functionality with MCP integration
2. Second attempt: Local operation with simulated AI features
3. Final fallback: Manual operation with user guidance

### State Persistence

To prevent data loss during errors, state is persisted:

```javascript
function saveState(state) {
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
}

function loadState() {
  if (fs.existsSync(stateFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    } catch (error) {
      console.error('Error loading state file:', error.message);
      return null;
    }
  }
  return null;
}
```

### Safe Command Execution

Commands that modify the system use validation and safe execution patterns:

```javascript
async function completeTask(taskId) {
  if (!taskId) {
    console.error("Cannot complete task: No task ID provided");
    return false;
  }
  
  try {
    await taskmaster(`update id=${taskId} status=completed`);
    return true;
  } catch (error) {
    console.error(`Failed to complete task #${taskId}: ${error.message}`);
    return false;
  }
}
```

## Troubleshooting Common Errors

### "Taskmaster command not found"

**Symptoms:** Error messages about missing taskmaster command

**Solution:**

1. Taskmaster will automatically switch to simulation mode
2. For real command execution, install the taskmaster CLI tool
3. Verify the command is in your PATH

### "Failed to connect to MCP Server"

**Symptoms:** Error connecting to MCP server, falling back to local operation

**Solution:**

1. Check that the MCP server is running
2. Verify connection settings in VS Code configuration
3. Check network connectivity
4. Continue with local operation if the server is unavailable

### "Error analyzing task"

**Symptoms:** Task analysis fails, fallback to manual breakdown

**Solution:**

1. Try again with the `--mcp-integrate` flag omitted
2. Verify the task ID exists and is correctly formatted
3. If using MCP integration, check server connectivity
4. Use manual task breakdown as a fallback

### "Error in file operations"

**Symptoms:** Cannot read or write task notes or documentation

**Solution:**

1. Verify the user has write permissions in the project directory
2. Check disk space availability
3. Ensure the `docs/taskmaster` directory exists
4. Try again with administrator privileges if needed

## Implementing Custom Error Handlers

When extending Taskmaster, follow these error handling patterns:

1. Use try/catch blocks for all asynchronous operations
2. Provide meaningful error messages
3. Implement fallback behavior for critical functions
4. Return boolean success indicators from functions that modify state
5. Log detailed error information for debugging

For example:

```javascript
async function customTaskmasterFeature() {
  try {
    // Feature implementation
    return { success: true, result: data };
  } catch (error) {
    console.error(`Error in customTaskmasterFeature: ${error.message}`);
    // Implement fallback logic
    return { success: false, error: error.message };
  }
}
```
