# Automated Form Proxy

The Automated Form Proxy is a command-line utility that streamlines interaction with Taskmaster tools by automatically filling forms with predefined values and executing the resulting commands. This tool is particularly useful for CI/CD pipelines, automation scripts, and recurring tasks that require consistent form inputs.

## Overview

The traditional form-based interface (`user-proxy-form-component.js`) requires manual input for each field. The Automated Form Proxy extends this functionality by allowing users to:

1. Predefined form values in JSON configuration files
2. Use built-in presets for common tasks
3. Export template configurations based on form structures
4. Test command execution with dry-run mode

## Getting Started

### Basic Usage

```bash
# Run with default settings (opens main form)
npm run auto-form

# Specify a particular form to automate
npm run auto-form:taskmaster

# Use a built-in preset
npm run auto-form:preset:tradeoff

# Export a template configuration for a form
npm run auto-form:export-config

# Test a command without executing it
npm run auto-form:dry-run
```

### Command-Line Options

You can also run the script directly with these options:

```bash
node scripts/automated-form-proxy.js --form=<formName> --config=<configFile> [--dry-run] [--verbose]

Options:
  --form        Form to automate (doc-analysis, terminology, taskmaster, fix-docs, main)
  --config      Path to JSON configuration file with predefined form answers
  --preset      Name of a built-in preset (alternative to --config)
  --dry-run     Show commands that would be executed without actually running them
  --verbose     Show detailed logs about form filling process
  --export      Export a template configuration based on the form structure
```

## Docker Usage

For consistent environments and easy deployment, you can use Docker to run the Automated Form Proxy. This approach ensures that all dependencies are correctly installed and the environment is properly configured.

### Using the Dockerfile

Build the Docker image:

```bash
docker build -f Dockerfile.automation -t automated-form-proxy .
```

Run the container with your preferred options:

```bash
# Run with default settings
docker run -it automated-form-proxy

# Specify a form and preset
docker run -it automated-form-proxy --form=terminology --preset=fix-terminology-all

# Mount volumes for configuration and output
docker run -it \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/output:/app/output \
  automated-form-proxy --form=taskmaster --config=/app/config/my-config.json
```

### Using Docker Compose

For even easier usage, we provide a Docker Compose configuration with predefined services:

```bash
# Run the documentation analysis service
docker-compose -f docker-compose.automation.yml run doc-analysis

# Run the terminology check service
docker-compose -f docker-compose.automation.yml run terminology-check

# Run a complete documentation quality check workflow
docker-compose -f docker-compose.automation.yml run doc-quality-check

# Run with a custom configuration file
CONFIG_FILE=my-custom-config.json docker-compose -f docker-compose.automation.yml run custom-config

# Run a specific workflow
WORKFLOW=implementation-phase-setup docker-compose -f docker-compose.automation.yml run workflow-runner
```

### Available Docker Compose Services

| Service | Description |
|---------|-------------|
| `form-proxy` | Base service with default settings |
| `doc-analysis` | Runs documentation analysis with the doc-analysis-taskmaster preset |
| `terminology-check` | Checks terminology across all documentation |
| `taskmaster-tradeoff` | Runs tradeoff analysis with MCP integration |
| `taskmaster-complete` | Marks the current task as complete |
| `custom-config` | Runs with a specified configuration file |
| `workflow-runner` | Runs a specified workflow from auto-form-presets.json |
| `doc-quality-check` | Runs the documentation quality check workflow |
| `implementation-setup` | Runs the implementation phase setup workflow |

## Configuration Files

The Automated Form Proxy accepts JSON configuration files that define form field values:

```json
{
  "doc-analysis": {
    "module": "taskmaster",
    "reportFormat": "markdown",
    "options": ["interactive", "fix-terminology"],
    "action": "run"
  },
  "taskmaster": {
    "version": "enhanced",
    "action": "tradeoff",
    "phase": "implementation",
    "options": ["mcp-integrate", "progress-report"],
    "taskId": "doc001",
    "action": "run"
  }
}
```

### Generating Configuration Templates

To generate a template configuration for a specific form:

```bash
npm run auto-form:export-config
# or
node scripts/automated-form-proxy.js --export --form=taskmaster
```

This command outputs a JSON structure with all the fields for the specified form, including default values.

## Built-in Presets

The Automated Form Proxy includes several built-in presets for common tasks:

| Preset | Description |
|--------|-------------|
| `doc-analysis-taskmaster` | Analyzes Taskmaster documentation with markdown report format |
| `fix-terminology-all` | Checks terminology consistency across all documentation |
| `taskmaster-tradeoff` | Runs tradeoff analysis with MCP integration |
| `taskmaster-complete-current` | Marks the current task as complete |

To use a built-in preset:

```bash
npm run auto-form:preset:tradeoff
# or
node scripts/automated-form-proxy.js --preset=taskmaster-tradeoff
```

## Supported Forms

The Automated Form Proxy supports the following forms:

### Main Form

The entry point form that allows selection of a tool to launch.

```json
{
  "main": {
    "tool": "doc-analysis"
  }
}
```

### Documentation Analysis

For analyzing documentation consistency and issues.

```json
{
  "doc-analysis": {
    "module": "taskmaster",
    "reportFormat": "markdown",
    "options": ["interactive", "fix-terminology"]
  }
}
```

### Terminology Checker

For checking and fixing terminology inconsistencies.

```json
{
  "terminology": {
    "action": "check"
  }
}
```

### Taskmaster

For task management and workflow operations.

```json
{
  "taskmaster": {
    "version": "enhanced",
    "action": "tradeoff",
    "phase": "implementation",
    "options": ["mcp-integrate", "progress-report"],
    "taskId": "doc001"
  }
}
```

### Fix Documentation

For interactively fixing documentation issues.

```json
{
  "fix-docs": {}
}
```

## CI/CD Integration

The Automated Form Proxy is particularly useful for CI/CD pipelines. Here's an example of using it in a GitHub Actions workflow:

```yaml
name: Documentation Quality Check

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  doc-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Check documentation consistency
        run: node scripts/automated-form-proxy.js --preset=fix-terminology-all
      - name: Generate documentation report
        run: node scripts/automated-form-proxy.js --form=doc-analysis --config=./ci/doc-report-config.json
```

## Troubleshooting

### Command Not Found

If you encounter a "command not found" error, ensure:

- You've installed all dependencies with `npm install`
- The script has executable permissions (`chmod +x scripts/automated-form-proxy.js`)
- The path to the script is correct

### Configuration Issues

If your configuration isn't being applied correctly:

- Check that your JSON is valid with no syntax errors
- Ensure you're using the correct field names for the form
- Use the `--verbose` flag to see detailed logs about form processing:

```bash
node scripts/automated-form-proxy.js --config=./my-config.json --verbose
```

### Dry Run Testing

If you're unsure what command will be executed, use the dry run mode:

```bash
node scripts/automated-form-proxy.js --config=./my-config.json --dry-run
```

This will print the command that would be executed without actually running it.

### Docker Issues

If you encounter issues with the Docker setup:

1. **Permission problems**: If you have permission issues with mounted volumes, ensure your user has the correct permissions or use `sudo`.

```bash
sudo docker-compose -f docker-compose.automation.yml run doc-analysis
```

1. **Container not starting**: Check that your Docker daemon is running:

```bash
docker info
```

1. **Command errors inside container**: Use the verbose flag to see more details:

```bash
docker run -it automated-form-proxy --verbose
```

1. **Volume mounting issues**: Ensure that the paths in your volume mounts exist:

```bash
mkdir -p ./output ./config
```

## Advanced Usage

### Creating Custom Presets

You can define your own presets by modifying the `PRESETS` object in the script. Alternatively, save your frequently used configurations as JSON files.

### Custom Docker Volumes

For specialized use cases, you can mount additional volumes to the Docker container:

```bash
docker run -it \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/output:/app/output \
  -v $(pwd)/custom-data:/app/custom-data \
  automated-form-proxy
```

### Combining with Other Automation Tools

The Automated Form Proxy works well with shell scripts, cron jobs, and other automation tools:

```bash
# Example shell script for nightly documentation checks
#!/bin/bash
cd /path/to/project
npm run auto-form:preset:fix-terminology
npm run auto-form:docs -- --config=./config/report-config.json

# Send email with report
cat ./docs/report.md | mail -s "Documentation Report" team@example.com
```

## Feature Roadmap

- **Web UI**: A web-based interface for managing configurations and presets
- **Schedule Manager**: Built-in scheduler for running automated tasks
- **Result Parser**: Automated parsing of task results for further processing
- **Integration API**: REST API for integrating with external systems
