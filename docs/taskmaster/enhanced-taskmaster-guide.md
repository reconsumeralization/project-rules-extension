# Enhanced Taskmaster Workflow Guide

This document explains how to use the enhanced version of Taskmaster to automate development workflows with structured phases and MCP server integration.

## Overview

The Enhanced Taskmaster workflow builds on the original Taskmaster script with the following key improvements:

1. **Structured Development Phases**: Tasks are organized into distinct development phases
2. **AI-Driven Task Breakdown**: Automatic task analysis and breakdown with MCP server integration
3. **Phase-Based Progress Tracking**: Visualize progress across different phases of development
4. **MCP Server Integration**: Connect to Model Context Protocol servers for AI-assisted development
5. **Improved Automation**: Enhanced CI/CD workflows for phase-based development

## Development Phases

Tasks are structured within the following development phases:

- **Planning**: Requirements gathering and analysis
- **Design**: Architecture and interface design
- **Implementation**: Code implementation and feature development
- **Testing**: Unit and integration testing
- **Review**: Code review and documentation
- **Deployment**: Preparation for release and deployment

## Getting Started

### Basic Usage

Run the Enhanced Taskmaster script in interactive mode:

```bash
npm run taskmaster:enhanced
```

### Phase-Based Development

To work within a specific development phase:

```bash
npm run taskmaster:phase-planning
npm run taskmaster:phase-design
npm run taskmaster:phase-implementation
npm run taskmaster:phase-testing
npm run taskmaster:phase-review
npm run taskmaster:phase-deployment
```

Or use the direct command with a custom phase:

```bash
node scripts/taskmaster-enhanced.js --phase=<phase-name>
```

### Task Analysis and Breakdown

To analyze and automatically break down a specific task:

```bash
npm run taskmaster:analyze -- <task-id>
```

Or use the direct command:

```bash
node scripts/taskmaster-enhanced.js --analyze-task=<task-id>
```

### MCP Server Integration

Enable MCP server integration for AI-assisted development:

```bash
npm run taskmaster:mcp
```

Or combine it with other commands:

```bash
node scripts/taskmaster-enhanced.js --phase=implementation --mcp-integrate
```

### Progress Reporting

Generate a progress report across all development phases:

```bash
npm run taskmaster:progress
```

### Automated Mode

Run in automated mode with MCP integration:

```bash
npm run taskmaster:auto-enhanced
```

## GitHub Actions Integration

The Enhanced Taskmaster workflow can be triggered through GitHub Actions:

1. Go to the "Actions" tab in your GitHub repository
2. Select "Enhanced Taskmaster Workflow"
3. Click "Run workflow"
4. Configure the workflow:
   - Select a development phase
   - Choose an action to perform
   - Enter a task ID (if applicable)
   - Toggle MCP integration
5. Click "Run workflow" to start the process

## Task Breakdown With MCP Server

When breaking down tasks with MCP server integration, the system:

1. Connects to the MCP server
2. Identifies the appropriate AI agent for the current development phase
3. Analyzes the task and generates recommended subtasks
4. Presents the subtasks for review and approval
5. Creates the approved subtasks in the task tracking system

Each subtask is automatically assigned to the appropriate development phase with an estimated complexity score.

## Visualizing Progress

The progress report shows:

- Overall project completion metrics
- Phase-based progress with visual indicators
- Tasks in progress per phase
- Next steps recommendations

## Configuring MCP Server Connection

To configure the MCP server connection:

1. Open the VS Code settings
2. Navigate to Project Rules settings
3. Set the following values:
   - MCP Server URL
   - Authentication token
   - Agent refresh settings

## Troubleshooting

### MCP Connection Issues

If you encounter connection issues:

1. Verify the MCP server URL in settings
2. Check that the server is running
3. Validate authentication credentials
4. If connection fails, Taskmaster will fall back to local operation

### Task Breakdown Failures

If task breakdown fails:

1. Try running without MCP integration
2. Use manual task breakdown as a fallback
3. Verify task details are properly formatted

## Extending the Enhanced Workflow

The Enhanced Taskmaster workflow can be extended by:

1. Adding new development phases in `scripts/taskmaster-enhanced.js`
2. Creating custom agents in the MCP server for specialized analysis
3. Extending the progress visualization with custom metrics

For further assistance, contact the development team.
