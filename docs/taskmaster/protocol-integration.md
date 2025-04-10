# MCP Protocol Integration Guide

This guide explains how the Model Context Protocol (MCP) integrates with the Taskmaster workflow system to provide AI-assisted development capabilities.

## What is MCP Integration?

The Model Context Protocol (MCP) is a standardized way to document and share critical information about AI models, their parameters, limitations, and use cases. When integrated with Taskmaster, it provides:

1. **AI-Assisted Task Management**: Intelligent analysis and breakdown of tasks
2. **Enhanced Tradeoff Analysis**: Data-driven evaluation of implementation approaches
3. **Progress Tracking**: Advanced metrics and visualizations of development progress
4. **Agent-Based Assistance**: Specialized AI agents for different development phases

## MCP Server Architecture

The MCP server operates as a separate service that communicates with the Taskmaster workflow:

```tsk
┌───────────────┐       ┌───────────────┐      ┌───────────────┐
│               │       │               │      │               │
│   Taskmaster  │◄─────▶│   MCP Server  │◄────▶│   AI Models   │
│   Workflow    │       │   & Agents    │      │   & Services  │
│               │       │               │      │               │
└───────────────┘       └───────────────┘      └───────────────┘
```

The MCP Server hosts specialized agents:

- **Protocol Validator Agent**: For planning phase tasks, schema validation
- **Integration Assistant Agent**: For design and implementation phase tasks
- **Protocol Enhancement Agent**: For review phase tasks and tradeoff analysis
- **Monitoring & Analytics Agent**: For tracking project metrics and progress

## Setting Up MCP Server Connection

### Configuration

Configure MCP server connection in VS Code settings:

1. Open VS Code settings
2. Navigate to Extensions > Project Rules
3. Set the following:
   - `projectRules.serverUrl`: URL of the MCP server (default: <http://localhost:3000>)
   - `projectRules.authToken`: Bearer token for authentication (if required)
   - `projectRules.mcpAgents.autoRefreshOnFocus`: Enable auto-refresh of agent stats

Alternatively, create a `.taskmaster.json` file in your project root:

```json
{
  "mcpServer": {
    "url": "http://localhost:3000",
    "token": "your-auth-token",
    "refreshInterval": 300
  },
  "agents": {
    "validator": {
      "enabled": true,
      "parameters": {
        "strictMode": false
      }
    },
    "assistant": {
      "enabled": true,
      "parameters": {
        "detailedFeedback": true
      }
    },
    "enhancement": {
      "enabled": true
    },
    "monitoring": {
      "enabled": true,
      "parameters": {
        "collectMetrics": true
      }
    }
  }
}
```

### Starting the MCP Server

Run the MCP server using:

```bash
node server/mcp-server.js
```

The server will start on port 3000 by default. You should see output similar to:

```tsk
[MCP Server] Starting on port 3000...
[MCP Server] Initializing Protocol Framework v0.9.3
[MCP Server] Loading agent configurations...
[MCP Server] 4 agents initialized successfully
[MCP Server] Server running at http://localhost:3000
```

## Enabling MCP Integration in Taskmaster

Add the `--mcp-integrate` flag to any Taskmaster command:

```bash
npm run taskmaster:enhanced -- --mcp-integrate
```

Or use specific MCP-enabled commands:

```bash
npm run taskmaster:mcp
npm run taskmaster:tradeoff-mcp
npm run taskmaster:auto-enhanced
```

## Working with MCP Protocols

### Protocol Structure

Each protocol is structured as a JSON document with these sections:

```json
{
  "name": "model-context-protocol-001",
  "version": "1.0.0",
  "type": "EventHandling",
  "description": "Standardized interface for event handling",
  "sections": {
    "overview": { ... },
    "schema": { ... },
    "examples": { ... },
    "integration": { ... },
    "testing": { ... },
    "performance": { ... }
  }
}
```

### Creating a New Protocol

From VS Code, use the command:

```tsk
Project Rules: Open MCP Protocol Editor
```

Or use the API directly:

```typescript
const response = await fetch('http://localhost:3000/api/protocols', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    name: 'model-context-protocol-002',
    type: 'TaskManagement',
    version: '1.0.0',
    description: 'Protocol for standardized task management'
  })
});
```

## MCP Agent Capabilities

### Protocol Validator Agent

Used during planning phase to:

- Validate task requirements against protocols
- Ensure compliance with project standards
- Identify missing requirements
- Estimate task complexity

### Integration Assistant Agent

Used during design and implementation phases to:

- Break down tasks into manageable subtasks
- Generate starter implementations
- Create testing strategies
- Provide code examples aligned with protocols

### Protocol Enhancement Agent

Used during review phase and for tradeoff analysis to:

- Evaluate implementation approaches
- Analyze pros and cons of different solutions
- Suggest improvements to existing code
- Recommend architectural decisions

### Monitoring & Analytics Agent

Used throughout the project lifecycle to:

- Track progress across development phases
- Generate metrics and visualizations
- Detect bottlenecks and issues
- Provide recommendations for process improvements

## Using Agents for Specific Tasks

### Task Analysis

```bash
npm run taskmaster:analyze -- --task=123 --mcp-integrate
```

This command will:

1. Connect to the MCP server
2. Based on the task's phase, select the appropriate agent
3. Have the agent analyze the task and suggest subtasks
4. Create the subtasks in Taskmaster

### Tradeoff Analysis

```bash
npm run taskmaster:tradeoff-task -- 145 --mcp-integrate
```

This will:

1. Connect to the Protocol Enhancement Agent
2. Analyze the task requirements
3. Generate multiple implementation approaches
4. Evaluate pros/cons and metrics for each
5. Present options and record the selected approach

### Progress Reporting

```bash
npm run taskmaster:progress -- --mcp-integrate
```

The Monitoring Agent will:

1. Analyze task progress across all phases
2. Calculate completion percentages and metrics
3. Generate visualizations
4. Identify bottlenecks or blocked tasks
5. Make recommendations for improving progress

## MCP Protocol Compliance

Protocols define standards that your implementation should follow. The MCP agents check compliance in these areas:

1. **Interface Conformance**: Ensuring APIs match the protocol specifications
2. **Behavior Consistency**: Verifying that implementations behave as expected
3. **Performance Characteristics**: Checking that implementations meet performance criteria
4. **Documentation Quality**: Ensuring proper documentation of implementations

### Compliance Scoring

Each implementation receives a compliance score:

- **90-100%**: Excellent - Fully compliant with protocols
- **80-89%**: Good - Minor deviations from protocols
- **70-79%**: Adequate - Some areas need improvement
- **Below 70%**: Needs Revision - Significant compliance issues

## Troubleshooting MCP Integration

### Connection Issues

If unable to connect to the MCP server:

1. Verify the server is running with `curl http://localhost:3000/api/status`
2. Check network connectivity and firewall settings
3. Verify the URL and port in your configuration
4. Check authentication token if required

### Agent Processing Issues

If agents are not providing expected results:

1. Check agent logs in the MCP Server view
2. Verify the task has sufficient information for analysis
3. Try running with the `--debug` flag for more detailed output
4. Restart the MCP server to reinitialize agents

### Protocol Validation Failures

If protocol validation is failing:

1. View the detailed validation errors in the logs
2. Check your implementation against the protocol schema
3. Use the Protocol Editor to review the protocol requirements
4. Consider updating the protocol if requirements have changed

## Extending MCP Integration

### Creating Custom Agents

You can create custom agents for specific project needs:

1. Define the agent's capabilities and parameters
2. Implement the agent logic in the MCP server
3. Register the agent with the server
4. Configure the agent in the Taskmaster configuration

### Developing Custom Protocols

For project-specific needs, create custom protocols:

1. Use the Protocol Editor to create a new protocol
2. Define the schema and requirements
3. Add examples and integration guidelines
4. Publish the protocol to the MCP server
5. Reference the protocol in your Taskmaster configuration

## Conclusion

MCP integration provides powerful AI capabilities to the Taskmaster workflow, enhancing task management, decision-making, and progress tracking. By leveraging specialized agents for different development phases, teams can work more efficiently and maintain higher standards of quality.

For more information, visit the [Project Rules Extension documentation](https://github.com/reconsumeralization/project-rules-extension/wiki) or contact the development team.
