#!/usr/bin/env node

// Dead Code Detector
// 
// A tool that identifies unused or unreachable code in your codebase.
// 
// Usage:
//   node dead-code-detector.js [options]
// 
// Options:
//   --src DIR             Source directory to analyze (default: ./src)
//   --include PATTERN     File pattern to include (default: **/*.{js,ts,jsx,tsx})
//   --exclude PATTERN     File pattern to exclude (default: **/*.{test,spec}.{js,ts,jsx,tsx})
//   --output FILE         Output file for report (default: dead-code-report.md)
//   --format FORMAT       Output format: markdown|json|html|text (default: markdown)
//   --ignore-comments     Ignore commented code (default: false)
//   --threshold NUMBER    Confidence threshold for reporting (default: 75)
//   --verbose             Display detailed information
//   --help                Display this help

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default

// Chalk v5+ is ESM only, fallback to basic console colors
function colorize(text, color) {
  const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    reset: '\x1b[0m'
  }
  return `${colors[color] || ''}${text}${colors.reset}`
}

// Create chalk-like interface
const chalk = {
  blue: (text) => colorize(text, 'blue'),
  green: (text) => colorize(text, 'green'),
  yellow: (text) => colorize(text, 'yellow'),
  red: (text) => colorize(text, 'red')
}

// Default configuration
const config = {
  srcDir: './src',
  includePattern: '**/*.{js,ts,jsx,tsx}',
  excludePattern: '**/*.{test,spec}.{js,ts,jsx,tsx}',
  outputFile: 'dead-code-report.md',
  format: 'markdown',
  ignoreComments: false,
  threshold: 75,
  verbose: false
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  
  for (const arg of args) {
    if (arg === '--help') {
      displayHelp()
      process.exit(0)
    } else if (arg === '--verbose') {
      config.verbose = true
    } else if (arg === '--ignore-comments') {
      config.ignoreComments = true
    } else if (arg.startsWith('--src=')) {
      config.srcDir = arg.substring(6)
    } else if (arg.startsWith('--include=')) {
      config.includePattern = arg.substring(10)
    } else if (arg.startsWith('--exclude=')) {
      config.excludePattern = arg.substring(10)
    } else if (arg.startsWith('--output=')) {
      config.outputFile = arg.substring(9)
    } else if (arg.startsWith('--format=')) {
      const format = arg.substring(9)
      if (['markdown', 'json', 'html', 'text'].includes(format)) {
        config.format = format
      } else {
        console.error(`Invalid format: ${format}. Using default: markdown`)
      }
    } else if (arg.startsWith('--threshold=')) {
      const threshold = parseInt(arg.substring(12), 10)
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 100) {
        config.threshold = threshold
      } else {
        console.error(`Invalid threshold: ${arg.substring(12)}. Using default: 75`)
      }
    }
  }
}

// Display help information
function displayHelp() {
  console.log(`
Dead Code Detector - A tool that identifies unused or unreachable code in your codebase.

Usage:
  node dead-code-detector.js [options]

Options:
  --src=DIR             Source directory to analyze (default: "./src")
  --include=PATTERN     File pattern to include (default: "**/*.{js,ts,jsx,tsx}")
  --exclude=PATTERN     File pattern to exclude (default: "**/*.{test,spec}.{js,ts,jsx,tsx}")
  --output=FILE         Output file for report (default: "dead-code-report.md")
  --format=FORMAT       Output format: markdown|json|html|text (default: "markdown")
  --ignore-comments     Ignore commented code (default: false)
  --threshold=NUMBER    Confidence threshold for reporting (default: 75)
  --verbose             Display detailed information
  --help                Display this help
  `)
}

// Find files to analyze
function findFiles() {
  if (config.verbose) {
    console.log(`Scanning directory: ${config.srcDir}`)
    console.log(`Include pattern: ${config.includePattern}`)
    console.log(`Exclude pattern: ${config.excludePattern}`)
  }
  
  return glob.sync(config.includePattern, {
    cwd: config.srcDir,
    ignore: config.excludePattern,
    absolute: true
  })
}

// Analyze a file for dead code
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const issues = []
    
    // Parse the file
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'dynamicImport'
      ],
      errorRecovery: true
    })
    
    // Track declarations and their usage
    const declarations = new Map()
    const usages = new Set()
    
    // Find unreachable code
    const unreachableSections = []
    
    // Traverse the AST
    traverse(ast, {
      // Track variable declarations
      VariableDeclarator(path) {
        if (path.node.id.type === 'Identifier') {
          const name = path.node.id.name
          declarations.set(name, {
            type: 'variable',
            loc: path.node.loc,
            confidence: 80
          })
        }
      },
      
      // Track function declarations
      FunctionDeclaration(path) {
        if (path.node.id && path.node.id.type === 'Identifier') {
          const name = path.node.id.name
          declarations.set(name, {
            type: 'function',
            loc: path.node.loc,
            confidence: 90
          })
        }
      },
      
      // Track import declarations
      ImportDeclaration(path) {
        path.node.specifiers.forEach(specifier => {
          if (specifier.local && specifier.local.type === 'Identifier') {
            const name = specifier.local.name
            declarations.set(name, {
              type: 'import',
              source: path.node.source.value,
              loc: specifier.loc,
              confidence: 95
            })
          }
        })
      },
      
      // Track identifier usage
      Identifier(path) {
        // Skip if it's a declaration
        if (
          path.parent.type === 'VariableDeclarator' && path.parent.id === path.node ||
          path.parent.type === 'FunctionDeclaration' && path.parent.id === path.node ||
          path.parent.type === 'ImportSpecifier' && path.parent.local === path.node ||
          path.parent.type === 'ImportDefaultSpecifier' && path.parent.local === path.node ||
          path.parent.type === 'ImportNamespaceSpecifier' && path.parent.local === path.node
        ) {
          return
        }
        
        usages.add(path.node.name)
      },
      
      // Find unreachable code after return/break/continue
      ReturnStatement(path) {
        const bodyPath = path.parentPath
        if (bodyPath.isBlockStatement()) {
          const statementIndex = bodyPath.node.body.indexOf(path.node)
          if (statementIndex !== -1 && statementIndex < bodyPath.node.body.length - 1) {
            unreachableSections.push({
              type: 'after-return',
              loc: {
                start: bodyPath.node.body[statementIndex + 1].loc.start,
                end: bodyPath.node.body[bodyPath.node.body.length - 1].loc.end
              },
              confidence: 100
            })
          }
        }
      }
    })
    
    // Find unused declarations
    for (const [name, info] of declarations) {
      if (!usages.has(name)) {
        issues.push({
          type: `unused-${info.type}`,
          name,
          location: `${filePath}:${info.loc.start.line}:${info.loc.start.column}`,
          confidence: info.confidence,
          message: `Unused ${info.type} '${name}'`
        })
      }
    }
    
    // Add unreachable code sections
    for (const section of unreachableSections) {
      issues.push({
        type: 'unreachable-code',
        location: `${filePath}:${section.loc.start.line}:${section.loc.start.column}`,
        confidence: section.confidence,
        message: `Unreachable code after ${section.type.replace('-', ' ')}`
      })
    }
    
    // Find commented out code (simple heuristic)
    if (!config.ignoreComments) {
      const lines = content.split('\n')
      let inBlockComment = false
      let blockCommentStart = 0
      let consecutiveCommentLines = 0
      let commentBlockStart = 0
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        
        // Check for block comments
        if (line.includes('/*') && !line.includes('*/')) {
          inBlockComment = true
          blockCommentStart = i
          continue
        }
        
        if (inBlockComment && line.includes('*/')) {
          inBlockComment = false
          const blockLength = i - blockCommentStart + 1
          
          // If block comment is more than 3 lines, it might be commented code
          if (blockLength > 3) {
            issues.push({
              type: 'commented-code',
              location: `${filePath}:${blockCommentStart + 1}:0`,
              confidence: 60,
              message: `Possible commented out code (${blockLength} lines block comment)`
            })
          }
          continue
        }
        
        // Check for consecutive line comments
        if (line.startsWith('//')) {
          if (consecutiveCommentLines === 0) {
            commentBlockStart = i
          }
          consecutiveCommentLines++
        } else {
          if (consecutiveCommentLines > 3) {
            issues.push({
              type: 'commented-code',
              location: `${filePath}:${commentBlockStart + 1}:0`,
              confidence: 50,
              message: `Possible commented out code (${consecutiveCommentLines} consecutive comment lines)`
            })
          }
          consecutiveCommentLines = 0
        }
      }
      
      // Check if file ends with consecutive comments
      if (consecutiveCommentLines > 3) {
        issues.push({
          type: 'commented-code',
          location: `${filePath}:${commentBlockStart + 1}:0`,
          confidence: 50,
          message: `Possible commented out code (${consecutiveCommentLines} consecutive comment lines)`
        })
      }
    }
    
    return {
      filePath,
      issues: issues.filter(issue => issue.confidence >= config.threshold)
    }
  } catch (error) {
    console.error(`Error analyzing ${filePath}: ${error.message}`)
    return {
      filePath,
      issues: [],
      error: error.message
    }
  }
}

// Generate report in markdown format
function generateMarkdownReport(results) {
  let markdown = '# Dead Code Analysis Report\n\n'
  
  // Summary
  const totalIssues = results.reduce((sum, file) => sum + file.issues.length, 0)
  markdown += `## Summary\n\n`
  markdown += `- **Date:** ${new Date().toISOString().split('T')[0]}\n`
  markdown += `- **Total Files Analyzed:** ${results.length}\n`
  markdown += `- **Total Issues Found:** ${totalIssues}\n`
  markdown += `- **Confidence Threshold:** ${config.threshold}%\n\n`
  
  // Group issues by type
  const issuesByType = {}
  results.forEach(file => {
    file.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = []
      }
      issuesByType[issue.type].push({ ...issue, filePath: file.filePath })
    })
  })
  
  // Issues by type
  markdown += `## Issues by Type\n\n`
  for (const [type, issues] of Object.entries(issuesByType)) {
    markdown += `### ${type} (${issues.length})\n\n`
    markdown += `| File | Location | Message | Confidence |\n`
    markdown += `| ---- | -------- | ------- | ---------- |\n`
    
    issues.forEach(issue => {
      const relativeFilePath = path.relative(process.cwd(), issue.filePath)
      const location = issue.location.split(':').slice(1).join(':')
      markdown += `| ${relativeFilePath} | ${location} | ${issue.message} | ${issue.confidence}% |\n`
    })
    
    markdown += '\n'
  }
  
  // Recommendations
  markdown += `## Recommendations\n\n`
  markdown += `1. Review high-confidence issues (90%+) first as they are most likely to be actual dead code.\n`
  markdown += `2. Consider removing unused imports to improve bundle size and loading performance.\n`
  markdown += `3. Unreachable code should be removed as it will never execute.\n`
  markdown += `4. Commented code blocks should be either restored or removed entirely.\n`
  markdown += `5. For lower confidence issues, verify manually before removing.\n\n`
  
  markdown += `## Next Steps\n\n`
  markdown += `- Run the tool regularly as part of your CI/CD pipeline\n`
  markdown += `- Consider setting up a git pre-commit hook to check for dead code\n`
  markdown += `- Add ignores for intentionally unused code (e.g., for documentation or future use)\n`
  
  return markdown
}

// Generate report in JSON format
function generateJsonReport(results) {
  const report = {
    summary: {
      date: new Date().toISOString().split('T')[0],
      totalFiles: results.length,
      totalIssues: results.reduce((sum, file) => sum + file.issues.length, 0),
      confidenceThreshold: config.threshold
    },
    results
  }
  
  return JSON.stringify(report, null, 2)
}

// Generate report in HTML format
function generateHtmlReport(results) {
  const totalIssues = results.reduce((sum, file) => sum + file.issues.length, 0)
  
  // Group issues by type
  const issuesByType = {}
  results.forEach(file => {
    file.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = []
      }
      issuesByType[issue.type].push({ ...issue, filePath: file.filePath })
    })
  })
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dead Code Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #3498db; margin-top: 30px; }
    h3 { color: #e74c3c; }
    .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .summary p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    tr:hover { background-color: #f5f5f5; }
    .recommendations { background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .confidence-high { color: #e74c3c; }
    .confidence-medium { color: #f39c12; }
    .confidence-low { color: #3498db; }
  </style>
</head>
<body>
  <h1>Dead Code Analysis Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}</p>
    <p><strong>Total Files Analyzed:</strong> ${results.length}</p>
    <p><strong>Total Issues Found:</strong> ${totalIssues}</p>
    <p><strong>Confidence Threshold:</strong> ${config.threshold}%</p>
  </div>
  
  <h2>Issues by Type</h2>`
  
  for (const [type, issues] of Object.entries(issuesByType)) {
    html += `
  <h3>${type} (${issues.length})</h3>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Location</th>
        <th>Message</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>`
    
    issues.forEach(issue => {
      const relativeFilePath = path.relative(process.cwd(), issue.filePath)
      const location = issue.location.split(':').slice(1).join(':')
      let confidenceClass = 'confidence-medium'
      if (issue.confidence >= 90) {confidenceClass = 'confidence-high'}
      else if (issue.confidence < 70) {confidenceClass = 'confidence-low'}
      
      html += `
      <tr>
        <td>${relativeFilePath}</td>
        <td>${location}</td>
        <td>${issue.message}</td>
        <td class="${confidenceClass}">${issue.confidence}%</td>
      </tr>`
    })
    
    html += `
    </tbody>
  </table>`
  }
  
  html += `
  <div class="recommendations">
    <h2>Recommendations</h2>
    <ol>
      <li>Review high-confidence issues (90%+) first as they are most likely to be actual dead code.</li>
      <li>Consider removing unused imports to improve bundle size and loading performance.</li>
      <li>Unreachable code should be removed as it will never execute.</li>
      <li>Commented code blocks should be either restored or removed entirely.</li>
      <li>For lower confidence issues, verify manually before removing.</li>
    </ol>
  </div>
  
  <h2>Next Steps</h2>
  <ul>
    <li>Run the tool regularly as part of your CI/CD pipeline</li>
    <li>Consider setting up a git pre-commit hook to check for dead code</li>
    <li>Add ignores for intentionally unused code (e.g., for documentation or future use)</li>
  </ul>
</body>
</html>`
  
  return html
}

// Generate report in text format
function generateTextReport(results) {
  const totalIssues = results.reduce((sum, file) => sum + file.issues.length, 0)
  
  let text = `=== Dead Code Analysis Report ===\n\n`
  
  // Summary
  text += `== Summary ==\n\n`
  text += `Date: ${new Date().toISOString().split('T')[0]}\n`
  text += `Total Files Analyzed: ${results.length}\n`
  text += `Total Issues Found: ${totalIssues}\n`
  text += `Confidence Threshold: ${config.threshold}%\n\n`
  
  // Group issues by type
  const issuesByType = {}
  results.forEach(file => {
    file.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = []
      }
      issuesByType[issue.type].push({ ...issue, filePath: file.filePath })
    })
  })
  
  // Issues by type
  text += `== Issues by Type ==\n\n`
  for (const [type, issues] of Object.entries(issuesByType)) {
    text += `=== ${type} (${issues.length}) ===\n\n`
    
    issues.forEach(issue => {
      const relativeFilePath = path.relative(process.cwd(), issue.filePath)
      text += `File: ${relativeFilePath}\n`
      text += `Location: ${issue.location.split(':').slice(1).join(':')}\n`
      text += `Message: ${issue.message}\n`
      text += `Confidence: ${issue.confidence}%\n\n`
    })
  }
  
  // Recommendations
  text += `== Recommendations ==\n\n`
  text += `1. Review high-confidence issues (90%+) first as they are most likely to be actual dead code.\n`
  text += `2. Consider removing unused imports to improve bundle size and loading performance.\n`
  text += `3. Unreachable code should be removed as it will never execute.\n`
  text += `4. Commented code blocks should be either restored or removed entirely.\n`
  text += `5. For lower confidence issues, verify manually before removing.\n\n`
  
  text += `== Next Steps ==\n\n`
  text += `- Run the tool regularly as part of your CI/CD pipeline\n`
  text += `- Consider setting up a git pre-commit hook to check for dead code\n`
  text += `- Add ignores for intentionally unused code (e.g., for documentation or future use)\n`
  
  return text
}

// Generate and save the report
function generateReport(results) {
  let content = ''
  
  switch (config.format.toLowerCase()) {
    case 'json':
      content = generateJsonReport(results)
      break
    case 'html':
      content = generateHtmlReport(results)
      break
    case 'text':
      content = generateTextReport(results)
      break
    case 'markdown':
    default:
      content = generateMarkdownReport(results)
      break
  }
  
  fs.writeFileSync(config.outputFile, content)
  console.log(`Report saved to ${config.outputFile}`)
  
  // Print summary to console
  const totalIssues = results.reduce((sum, file) => sum + file.issues.length, 0)
  console.log(`\nAnalysis complete:`)
  console.log(`- ${results.length} files analyzed`)
  console.log(`- ${totalIssues} issues found`)
  
  // Group issues by type for summary
  const issuesByType = {}
  results.forEach(file => {
    file.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = 0
      }
      issuesByType[issue.type]++
    })
  })
  
  // Print issue types
  for (const [type, count] of Object.entries(issuesByType)) {
    console.log(`- ${count} ${type} issues`)
  }
}

// Main function
function main() {
  console.log(chalk.blue('Dead Code Detector - Starting analysis'))
  
  // Parse command line arguments
  parseArgs()
  
  // Find files to analyze
  const files = findFiles()
  console.log(`Found ${files.length} files to analyze`)
  
  // Analyze files
  const results = []
  let fileCount = 0
  
  for (const file of files) {
    fileCount++
    if (config.verbose || fileCount % 10 === 0) {
      console.log(`Analyzing file ${fileCount}/${files.length}: ${file}`)
    }
    
    const result = analyzeFile(file)
    results.push(result)
  }
  
  // Generate report
  generateReport(results)
}

// Run the script
main() 