# GitHub Actions Version Compatibility Guide

## Overview

Our project uses the latest GitHub Actions versions in our workflows:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `peter-evans/create-pull-request@v7`

However, the VS Code/Cursor linter might show errors for these versions if your local schema validation is not updated.

## Understanding the Linter Errors

You might see errors like:

```error
Unable to resolve action `actions/checkout@v4`, repository or version not found
Unable to resolve action `actions/setup-node@v4`, repository or version not found
Unable to resolve action `peter-evans/create-pull-request@v7`, repository or version not found
```

These occur because the built-in YAML schema validator in VS Code/Cursor might not be updated to recognize the latest versions of these actions.

## How to Fix

### Method 1: Run the Schema Update Script

We've provided a script to update your local schema validation:

```bash
npm run lint:fix-github-actions
```

This will:

1. Download the latest GitHub Actions schema
2. Extend it to support our required action versions
3. Update your VS Code settings to use the custom schema

### Method 2: Manually Update Settings

1. Create a custom schema file at `.vscode/github-workflow-custom.json`
2. Update `.vscode/settings.json` to use the custom schema
3. Reload VS Code window

### Method 3: Ignore the Linter Errors

Since these errors only affect local development and not the actual functionality on GitHub:

- You can choose to ignore these warnings
- The workflow will still work correctly on GitHub

## Important Notes

- When adding new GitHub Actions to workflows, check their latest versions
- Update the custom schema if needed by adding new entries
- These linter errors don't affect the actual execution of workflows on GitHub
- The custom schema approach only affects your local environment

## More Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
- [actions/setup-node releases](https://github.com/actions/setup-node/releases)
- [peter-evans/create-pull-request releases](https://github.com/peter-evans/create-pull-request/releases)
