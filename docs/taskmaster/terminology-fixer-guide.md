# Terminology Fixer Guide

The Terminology Fixer is a powerful tool designed to automatically fix terminology inconsistencies across your codebase. It works in conjunction with the Terminology Checker to ensure consistent terminology throughout your project.

## Overview

Maintaining consistent terminology is crucial for project clarity and maintainability. The Terminology Fixer:

- Automatically fixes inconsistent terminology identified by the Terminology Checker
- Supports interactive mode for reviewing changes before applying
- Provides dry-run capability to preview changes without modifying files
- Can target specific file types (code or documentation)
- Generates detailed fix reports for audit purposes

## Getting Started

### Prerequisites

Before using the Terminology Fixer, you should:

1. Run the Terminology Checker to identify inconsistencies:

   ```bash
   npm run terminology:check
   ```

2. Review the generated report at `docs/taskmaster/fixes/terminology-check.md`

### Basic Usage

To automatically fix all identified terminology issues:
