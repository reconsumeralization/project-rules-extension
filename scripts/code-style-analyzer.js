#!/usr/bin/env node

/**
 * Code Style Analyzer
 * 
 * Analyzes code files for style consistency according to project standards.
 * Checks for formatting, naming conventions, imports structure, and more.
 * 
 * Usage:
 *   node code-style-analyzer.js [options]
 * 
 * Options:
 *   --dir=<directory>          Directory to analyze (default: current directory)
 *   --ext=<extensions>         Comma-separated list of extensions to check (default: js,ts,jsx,tsx)
 *   --check-imports            Check import ordering and structure
 *   --check-naming             Check naming conventions
 *   --check-formatting         Check code formatting
 *   --check-comments           Check comment style and presence
 *   --check-all                Check all style rules (default)
 *   --ignore=<patterns>        Comma-separated patterns to ignore
 *   --report=<format>          Output format: json, table, html (default: table)
 *   --output=<file>            Save report to file instead of stdout
 *   --fix                      Attempt to fix style issues
 *   --verbose                  Show detailed output
 *   --help                     Show this help message
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dir: process.cwd(),
  extensions: ['js', 'ts', 'jsx', 'tsx'],
  checkImports: false,
  checkNaming: false,
  checkFormatting: false,
  checkComments: false,
  checkAll: true,
  ignorePatterns: ['node_modules', 'dist', 'build', '.git'],
  reportFormat: 'table',
  outputFile: null,
  fix: false,
  verbose: false
};

// Process command line arguments
for (const arg of args) {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1];
  } else if (arg.startsWith('--ext=')) {
    options.extensions = arg.split('=')[1].split(',');
  } else if (arg === '--check-imports') {
    options.checkImports = true;
    options.checkAll = false;
  } else if (arg === '--check-naming') {
    options.checkNaming = true;
    options.checkAll = false;
  } else if (arg === '--check-formatting') {
    options.checkFormatting = true;
    options.checkAll = false;
  } else if (arg === '--check-comments') {
    options.checkComments = true;
    options.checkAll = false;
  } else if (arg === '--check-all') {
    options.checkAll = true;
  } else if (arg.startsWith('--ignore=')) {
    options.ignorePatterns = arg.split('=')[1].split(',');
  } else if (arg.startsWith('--report=')) {
    options.reportFormat = arg.split('=')[1];
  } else if (arg.startsWith('--output=')) {
    options.outputFile = arg.split('=')[1];
  } else if (arg === '--fix') {
    options.fix = true;
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--help') {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 23).join('\n').replace(/\*/g, ''));
    process.exit(0);
  }
}

// Determine which rules to check
if (options.checkAll) {
  options.checkImports = true;
  options.checkNaming = true;
  options.checkFormatting = true;
  options.checkComments = true;
}

// Style rules
const styleRules = {
  naming: {
    components: /^[A-Z][A-Za-z0-9]*$/,
    hooks: /^use[A-Z][A-Za-z0-9]*$/,
    constants: /^[A-Z][A-Z0-9_]*$/,
    functions: /^[a-z][a-zA-Z0-9]*$/,
    variables: /^[a-z][a-zA-Z0-9]*$/,
    interfaces: /^I[A-Z][a-zA-Z0-9]*$/,
    types: /^T[A-Z][a-zA-Z0-9]*$/,
  },
  imports: {
    order: ['react', 'external', 'internal', 'styles', 'types'],
    linesBetweenGroups: 1
  },
  formatting: {
    maxLineLength: 100,
    indentation: 2,
    semicolons: false,
    quotes: 'single',
    trailingComma: 'es5'
  },
  comments: {
    functionDoc: true,
    componentDoc: true,
    todoFormat: /TODO: .*(@\w+)?/
  }
};

// Results structure
const results = {
  summary: {
    filesAnalyzed: 0,
    issuesFound: 0,
    issuesFixed: 0,
    filesByStatus: { clean: 0, issues: 0, fixed: 0, error: 0 }
  },
  fileResults: []
};

/**
 * Recursively finds all files with specified extensions
 */
function findFiles(dir, extensions, ignorePatterns) {
  let files = [];
  
  if (shouldIgnore(dir, ignorePatterns)) {return files;}
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files = files.concat(findFiles(fullPath, extensions, ignorePatterns));
    } else if (entry.isFile() && extensions.includes(path.extname(entry.name).slice(1))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Checks if path should be ignored
 */
function shouldIgnore(filePath, ignorePatterns) {
  return ignorePatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Analyzes file content for style issues
 */
function analyzeFile(filePath, options) {
  const fileResult = {
    filePath: filePath.replace(options.dir + path.sep, ''),
    issues: [],
    fixed: false,
    error: null
  };
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    if (options.checkNaming) {
      checkNamingConventions(filePath, content, fileResult);
    }
    
    if (options.checkImports) {
      checkImports(filePath, content, fileResult);
    }
    
    if (options.checkFormatting) {
      checkFormatting(filePath, lines, fileResult);
    }
    
    if (options.checkComments) {
      checkComments(filePath, content, fileResult);
    }
    
    // Try to fix issues if requested
    if (options.fix && fileResult.issues.length > 0) {
      fixIssues(filePath, fileResult, options);
    }
    
  } catch (error) {
    fileResult.error = error.message;
    results.summary.filesByStatus.error++;
  }
  
  if (fileResult.fixed) {
    results.summary.filesByStatus.fixed++;
  } else if (fileResult.issues.length > 0) {
    results.summary.filesByStatus.issues++;
  } else if (!fileResult.error) {
    results.summary.filesByStatus.clean++;
  }
  
  results.summary.issuesFound += fileResult.issues.length;
  results.fileResults.push(fileResult);
  
  return fileResult;
}

/**
 * Check naming conventions
 */
function checkNamingConventions(filePath, content, fileResult) {
  const rules = styleRules.naming;
  
  // Component check - match export function ComponentName or export const ComponentName
  const componentMatches = content.match(/export\s+(function|const)\s+([A-Za-z0-9]+)/g) || [];
  
  for (const match of componentMatches) {
    const name = match.split(/\s+/).pop();
    
    if (name.charAt(0).toUpperCase() === name.charAt(0) && !rules.components.test(name)) {
      fileResult.issues.push({
        type: 'naming',
        rule: 'component',
        message: `Component '${name}' doesn't follow naming convention`,
        fix: 'Rename to follow PascalCase'
      });
    }
  }
  
  // Hook check
  const hookMatches = content.match(/function\s+(use[A-Za-z0-9]+)/g) || [];
  
  for (const match of hookMatches) {
    const name = match.split(/\s+/)[1];
    
    if (!rules.hooks.test(name)) {
      fileResult.issues.push({
        type: 'naming',
        rule: 'hook',
        message: `Hook '${name}' doesn't follow naming convention`,
        fix: 'Rename to start with use and follow camelCase'
      });
    }
  }
  
  // Regular functions and variables
  const functionMatches = content.match(/function\s+([a-zA-Z0-9]+)/g) || [];
  
  for (const match of functionMatches) {
    const name = match.split(/\s+/)[1];
    
    if (!name.startsWith('use') && !rules.functions.test(name)) {
      fileResult.issues.push({
        type: 'naming',
        rule: 'function',
        message: `Function '${name}' doesn't follow naming convention`,
        fix: 'Rename to follow camelCase'
      });
    }
  }
}

/**
 * Check import order and structure
 */
function checkImports(filePath, content, fileResult) {
  const importLines = content.match(/import.*from.*;?$/gm) || [];
  let lastGroup = '';
  let lastLine = -1;
  
  for (let i = 0; i < importLines.length; i++) {
    const importLine = importLines[i];
    const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
    
    if (!match) {continue;}
    
    const importPath = match[1];
    let currentGroup = '';
    
    if (importPath === 'react' || importPath.startsWith('react/')) {
      currentGroup = 'react';
    } else if (!importPath.startsWith('.')) {
      currentGroup = 'external';
    } else if (importPath.includes('/styles/')) {
      currentGroup = 'styles';
    } else if (importPath.includes('/types/')) {
      currentGroup = 'types';
    } else {
      currentGroup = 'internal';
    }
    
    // Check group order
    if (lastGroup && styleRules.imports.order.indexOf(currentGroup) < styleRules.imports.order.indexOf(lastGroup)) {
      fileResult.issues.push({
        type: 'imports',
        rule: 'order',
        message: `Import '${importPath}' (${currentGroup}) should come before ${lastGroup} imports`,
        fix: 'Reorder imports according to convention'
      });
    }
    
    lastGroup = currentGroup;
  }
}

/**
 * Check formatting rules
 */
function checkFormatting(filePath, lines, fileResult) {
  const rules = styleRules.formatting;
  
  // Check line length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.length > rules.maxLineLength) {
      fileResult.issues.push({
        type: 'formatting',
        rule: 'lineLength',
        line: i + 1,
        message: `Line ${i + 1} exceeds maximum length of ${rules.maxLineLength} characters`,
        fix: 'Break line into multiple lines'
      });
    }
  }
  
  // Check indentation
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {continue;}
    
    const indentMatch = line.match(/^(\s+)/);
    if (indentMatch) {
      const indent = indentMatch[1];
      if (indent.includes('\t')) {
        fileResult.issues.push({
          type: 'formatting',
          rule: 'indentation',
          line: i + 1,
          message: `Line ${i + 1} uses tabs for indentation instead of spaces`,
          fix: 'Convert tabs to spaces'
        });
      } else if (indent.length % rules.indentation !== 0) {
        fileResult.issues.push({
          type: 'formatting',
          rule: 'indentation',
          line: i + 1,
          message: `Line ${i + 1} has incorrect indentation (${indent.length} spaces)`,
          fix: `Adjust indentation to be multiple of ${rules.indentation} spaces`
        });
      }
    }
  }
  
  // Check semicolons
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('//') || line.startsWith('/*')) {continue;}
    
    if (!rules.semicolons && line.endsWith(';')) {
      fileResult.issues.push({
        type: 'formatting',
        rule: 'semicolons',
        line: i + 1,
        message: `Line ${i + 1} ends with semicolon when style guide forbids them`,
        fix: 'Remove semicolon'
      });
    }
  }
}

/**
 * Check comments structure and presence
 */
function checkComments(filePath, content, fileResult) {
  const rules = styleRules.comments;
  const lines = content.split('\n');
  
  // Check function documentation
  const functionMatches = content.match(/function\s+([a-zA-Z0-9]+)/g) || [];
  
  for (const match of functionMatches) {
    const functionName = match.split(/\s+/)[1];
    const functionIndex = content.indexOf(match);
    let hasDoc = false;
    
    // Look for doc comment before function
    const beforeFunction = content.substring(0, functionIndex).trimEnd();
    if (beforeFunction.endsWith('*/')) {
      hasDoc = true;
    }
    
    if (rules.functionDoc && !hasDoc) {
      fileResult.issues.push({
        type: 'comments',
        rule: 'functionDoc',
        message: `Function '${functionName}' is missing documentation`,
        fix: 'Add JSDoc comment before function'
      });
    }
  }
  
  // Check TODO format
  const todoRegex = /\/\/\s*TODO:?.*$/gm;
  const todoMatches = content.match(todoRegex) || [];
  
  for (const todo of todoMatches) {
    if (!rules.comments.todoFormat.test(todo)) {
      fileResult.issues.push({
        type: 'comments',
        rule: 'todoFormat',
        message: `TODO comment doesn't follow convention: "${todo.trim()}"`,
        fix: 'Format as "TODO: description @username"'
      });
    }
  }
}

/**
 * Attempt to fix issues in file
 */
function fixIssues(filePath, fileResult, options) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let fixed = false;
    
    for (const issue of fileResult.issues) {
      if (issue.type === 'formatting' && issue.rule === 'semicolons') {
        // Simple semicolon removal
        content = content.replace(/;(\r?\n|$)/g, '$1');
        fixed = true;
        results.summary.issuesFixed++;
      }
      
      // Add more issue fixing logic here
    }
    
    if (fixed) {
      fs.writeFileSync(filePath, content);
      fileResult.fixed = true;
    }
  } catch (error) {
    fileResult.error = `Failed to fix issues: ${error.message}`;
  }
}

/**
 * Generate report from results
 */
function generateReport(results, format) {
  switch (format) {
    case 'json':
      return JSON.stringify(results, null, 2);
    
    case 'html':
      return generateHtmlReport(results);
    
    case 'table':
    default:
      return generateTableReport(results);
  }
}

/**
 * Generate table format report
 */
function generateTableReport(results) {
  let report = 'Code Style Analysis Report\n';
  report += '===========================\n\n';
  
  report += 'Summary:\n';
  report += `  Files analyzed: ${results.summary.filesAnalyzed}\n`;
  report += `  Issues found: ${results.summary.issuesFound}\n`;
  report += `  Issues fixed: ${results.summary.issuesFixed}\n`;
  report += '  Files by status:\n';
  report += `    Clean: ${results.summary.filesByStatus.clean}\n`;
  report += `    With issues: ${results.summary.filesByStatus.issues}\n`;
  report += `    Fixed: ${results.summary.filesByStatus.fixed}\n`;
  report += `    Error: ${results.summary.filesByStatus.error}\n\n`;
  
  report += 'Files with issues:\n';
  
  const filesWithIssues = results.fileResults.filter(file => file.issues.length > 0);
  
  if (filesWithIssues.length === 0) {
    report += '  No issues found!\n';
  } else {
    for (const file of filesWithIssues) {
      report += `  ${file.filePath} (${file.issues.length} issues${file.fixed ? ', fixed' : ''})\n`;
      
      for (const issue of file.issues) {
        const location = issue.line ? `:${issue.line}` : '';
        report += `    - [${issue.type}/${issue.rule}${location}] ${issue.message}\n`;
        if (issue.fix) {
          report += `      Fix: ${issue.fix}\n`;
        }
      }
      
      report += '\n';
    }
  }
  
  return report;
}

/**
 * Generate HTML format report
 */
function generateHtmlReport(results) {
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Code Style Analysis Report</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
      h1 { color: #333; }
      .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      .file { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden; }
      .file-header { background: #eee; padding: 10px; font-weight: bold; display: flex; justify-content: space-between; }
      .file-issues { padding: 0 15px; }
      .issue { margin: 10px 0; padding-bottom: 10px; border-bottom: 1px solid #eee; }
      .issue-header { font-weight: bold; }
      .issue-fix { color: #060; margin-left: 20px; }
      .status-clean { color: green; }
      .status-issues { color: red; }
      .status-fixed { color: orange; }
      .status-error { color: darkred; }
    </style>
  </head>
  <body>
    <h1>Code Style Analysis Report</h1>
    
    <div class="summary">
      <h2>Summary</h2>
      <p>Files analyzed: ${results.summary.filesAnalyzed}</p>
      <p>Issues found: ${results.summary.issuesFound}</p>
      <p>Issues fixed: ${results.summary.issuesFixed}</p>
      <p>Files by status:</p>
      <ul>
        <li><span class="status-clean">Clean:</span> ${results.summary.filesByStatus.clean}</li>
        <li><span class="status-issues">With issues:</span> ${results.summary.filesByStatus.issues}</li>
        <li><span class="status-fixed">Fixed:</span> ${results.summary.filesByStatus.fixed}</li>
        <li><span class="status-error">Error:</span> ${results.summary.filesByStatus.error}</li>
      </ul>
    </div>
    
    <h2>Files with Issues</h2>
  `;
  
  const filesWithIssues = results.fileResults.filter(file => file.issues.length > 0);
  
  if (filesWithIssues.length === 0) {
    html += '<p>No issues found!</p>';
  } else {
    for (const file of filesWithIssues) {
      html += `
      <div class="file">
        <div class="file-header">
          <span>${file.filePath}</span>
          <span>${file.issues.length} issues${file.fixed ? ' (fixed)' : ''}</span>
        </div>
        <div class="file-issues">
      `;
      
      for (const issue of file.issues) {
        const location = issue.line ? `:${issue.line}` : '';
        html += `
          <div class="issue">
            <div class="issue-header">[${issue.type}/${issue.rule}${location}] ${issue.message}</div>
            ${issue.fix ? `<div class="issue-fix">Fix: ${issue.fix}</div>` : ''}
          </div>
        `;
      }
      
      html += `
        </div>
      </div>
      `;
    }
  }
  
  html += `
  </body>
  </html>
  `;
  
  return html;
}

// Main function
async function main() {
  console.log(`Analyzing code style in ${options.dir}...`);
  
  // Find all files to analyze
  const files = findFiles(options.dir, options.extensions, options.ignorePatterns);
  results.summary.filesAnalyzed = files.length;
  
  console.log(`Found ${files.length} files to analyze`);
  
  // Analyze each file
  for (const file of files) {
    if (options.verbose) {
      console.log(`Analyzing ${file}`);
    }
    
    analyzeFile(file, options);
  }
  
  // Generate report
  const report = generateReport(results, options.reportFormat);
  
  // Output report
  if (options.outputFile) {
    fs.writeFileSync(options.outputFile, report);
    console.log(`Report saved to ${options.outputFile}`);
  } else {
    console.log(report);
  }
  
  // Exit with error if issues were found
  process.exit(results.summary.issuesFound > 0 ? 1 : 0);
}

// Run main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 