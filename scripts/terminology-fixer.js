#!/usr/bin/env node

/**
 * Terminology Fixer
 * 
 * This script automatically fixes terminology inconsistencies identified by the
 * terminology-checker.js script.
 * 
 * Usage:
 *   node terminology-fixer.js [options]
 * 
 * Options:
 *   --input=<path>           Input report file from terminology checker (default: ./docs/taskmaster/fixes/terminology-check.md)
 *   --terms-file=<path>      Path to file containing preferred terminology (default: ./docs/taskmaster/terminology.json)
 *   --dry-run                Show changes without applying them
 *   --interactive            Confirm each change before applying
 *   --code-only              Only fix issues in code files
 *   --docs-only              Only fix issues in documentation files
 *   --verbose                Show detailed logs during fixing
 *   --help                   Show this help message
 *
 * Example:
 *   node terminology-fixer.js --interactive --docs-only
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// Default configuration
const config = {
  inputFile: './docs/taskmaster/fixes/terminology-check.md',
  termsFile: './docs/taskmaster/terminology.json',
  dryRun: false,
  interactive: false,
  codeOnly: false,
  docsOnly: false,
  verbose: false
}

// Colors for console output
const colors = {
  info: '\x1b[34m', // blue
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  success: '\x1b[32m', // green
  reset: '\x1b[0m',
  highlight: '\x1b[42m', // green background
  remove: '\x1b[41m', // red background
  add: '\x1b[32m' // green text
}

// Parse command line arguments
function parseArgs() {
  process.argv.slice(2).forEach(arg => {
    if (arg === '--help') {
      showHelp()
      process.exit(0)
    }
    if (arg === '--dry-run') {
      config.dryRun = true
      return
    }
    if (arg === '--interactive') {
      config.interactive = true
      return
    }
    if (arg === '--code-only') {
      config.codeOnly = true
      return
    }
    if (arg === '--docs-only') {
      config.docsOnly = true
      return
    }
    if (arg === '--verbose') {
      config.verbose = true
      return
    }

    const match = arg.match(/^--([^=]+)=(.+)$/)
    if (match) {
      const [, key, value] = match
      switch (key) {
        case 'input':
          config.inputFile = value
          break
        case 'terms-file':
          config.termsFile = value
          break
      }
    }
  })
  
  // Validate conflicting options
  if (config.codeOnly && config.docsOnly) {
    log("Error: Cannot use both --code-only and --docs-only", 'error')
    process.exit(1)
  }
}

function showHelp() {
  const helpText = fs.readFileSync(__filename, 'utf8')
    .split('\n')
    .slice(1, 19)
    .map(line => line.replace(/^\s*\* ?/, ''))
    .join('\n')
  
  console.log(helpText)
}

function log(message, level = 'info') {
  if (level === 'info' && !config.verbose) {
    return;
  }
  console.log(`${colors[level]}[${level.toUpperCase()}]${colors.reset} ${message}`)
}

// Load terminology mapping
function loadTerminology() {
  try {
    if (fs.existsSync(config.termsFile)) {
      const terms = JSON.parse(fs.readFileSync(config.termsFile, 'utf8'))
      log(`Loaded terminology from ${config.termsFile}`, 'info')
      return terms
    } else {
      log(`Terminology file not found at ${config.termsFile}`, 'error')
      process.exit(1)
    }
  } catch (error) {
    log(`Error loading terminology: ${error.message}`, 'error')
    process.exit(1)
  }
}

// Extract issues from JSON report
function extractIssuesFromJson() {
  try {
    const reportData = JSON.parse(fs.readFileSync(config.inputFile, 'utf8'))
    return reportData.issues
  } catch (error) {
    log(`Error parsing JSON report: ${error.message}`, 'error')
    process.exit(1)
  }
}

// Extract issues from Markdown report
function extractIssuesFromMarkdown() {
  const content = fs.readFileSync(config.inputFile, 'utf8')
  const issues = { code: {}, docs: {} }
  
  // Find code and documentation sections
  const codeSection = content.match(/## Issues in Code Files\n\n([\s\S]*?)(?=##|$)/)
  const docsSection = content.match(/## Issues in Documentation Files\n\n([\s\S]*?)(?=##|$)/)
  
  // Parse code issues
  if (codeSection && !config.docsOnly) {
    parseSection(codeSection[1], issues.code)
  }
  
  // Parse documentation issues
  if (docsSection && !config.codeOnly) {
    parseSection(docsSection[1], issues.docs)
  }
  
  return issues
}

// Parse a section of the markdown report
function parseSection(section, targetObj) {
  // Split into file sections
  const fileSections = section.split(/###\s+(.+?)\n/)
  
  for (let i = 1; i < fileSections.length; i += 2) {
    const filePath = fileSections[i].trim()
    const fileContent = fileSections[i + 1]
    
    // Skip table header
    const lines = fileContent.split('\n').slice(3)
    const fileIssues = []
    
    for (const line of lines) {
      // Skip empty lines and table separators
      if (!line.trim() || line.includes('---')) {
        continue
      }
      
      // Parse table row: | Line | Incorrect Term | Preferred Term | Context |
      const match = line.match(/\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/)
      if (match) {
        const [, lineNum, incorrect, preferred] = match
        fileIssues.push({
          line: parseInt(lineNum, 10),
          incorrect: incorrect.trim(),
          preferred: preferred.trim()
        })
      }
    }
    
    if (fileIssues.length > 0) {
      targetObj[filePath] = fileIssues
    }
  }
}

// Create an interactive console prompt
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
}

// Fix issues in a single file
async function fixFile(filePath, issues) {
  log(`Processing: ${filePath}`, 'info')
  
  if (!fs.existsSync(filePath)) {
    log(`File not found: ${filePath}`, 'error')
    return false
  }
  
  let content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const prompt = config.interactive ? createPrompt() : null
  
  // Sort issues by line number in descending order to avoid position shifts
  issues.sort((a, b) => b.line - a.line)
  
  let changesMade = false
  
  for (const issue of issues) {
    const lineIndex = issue.line - 1
    if (lineIndex < 0 || lineIndex >= lines.length) {
      log(`Invalid line number ${issue.line} for file ${filePath}`, 'warn')
      continue
    }
    
    const line = lines[lineIndex]
    
    // Find all occurrences of the incorrect term in this line
    const regex = new RegExp(`\\b${issue.incorrect.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g')
    const matches = [...line.matchAll(regex)]
    
    if (matches.length === 0) {
      log(`Term "${issue.incorrect}" not found in line ${issue.line}`, 'warn')
      continue
    }
    
    // For each occurrence, ask for confirmation if in interactive mode
    for (const match of matches) {
      const start = match.index
      const end = start + issue.incorrect.length
      
      // Create a preview with highlighting
      const preview = 
        line.substring(0, start) + 
        colors.remove + issue.incorrect + colors.reset + 
        line.substring(end, Math.min(line.length, end + 40)) + 
        ' → ' + 
        colors.add + issue.preferred + colors.reset
      
      const replacement = 
        line.substring(0, start) + 
        issue.preferred + 
        line.substring(end)
      
      if (config.interactive) {
        // In interactive mode, prompt for confirmation
        const answer = await new Promise(resolve => {
          prompt.question(`
File: ${filePath}:${issue.line}
${preview}

Replace? [Y/n/a(ll)/s(kip file)] `, answer => {
            resolve(answer.toLowerCase())
          })
        })
        
        if (answer === 'n') {
          continue
        } else if (answer === 's') {
          break
        } else if (answer === 'a') {
          config.interactive = false
          lines[lineIndex] = replacement
          changesMade = true
        } else {
          // Default is yes
          lines[lineIndex] = replacement
          changesMade = true
        }
      } else {
        // In non-interactive mode, make the change
        if (config.dryRun) {
          log(`Would replace: ${preview}`, 'info')
        } else {
          lines[lineIndex] = replacement
          changesMade = true
          log(`Fixed: ${preview}`, 'success')
        }
      }
    }
  }
  
  if (prompt) {
    prompt.close()
  }
  
  // Save the updated file content
  if (changesMade && !config.dryRun) {
    fs.writeFileSync(filePath, lines.join('\n'))
    log(`Updated: ${filePath}`, 'success')
    return true
  }
  
  return changesMade
}

// Fix all issues
async function fixIssues(issues) {
  let totalFixed = 0
  let totalFiles = 0
  
  // Process code files
  if (!config.docsOnly) {
    for (const [filePath, fileIssues] of Object.entries(issues.code)) {
      const fixed = await fixFile(filePath, fileIssues)
      if (fixed) {
        totalFixed += fileIssues.length
        totalFiles++
      }
    }
  }
  
  // Process documentation files
  if (!config.codeOnly) {
    for (const [filePath, fileIssues] of Object.entries(issues.docs)) {
      const fixed = await fixFile(filePath, fileIssues)
      if (fixed) {
        totalFixed += fileIssues.length
        totalFiles++
      }
    }
  }
  
  return { totalFixed, totalFiles }
}

// Generate a summary report
function generateSummaryReport(results) {
  const timestamp = new Date().toLocaleString()
  
  let summary = `# Terminology Fix Summary

Generated on: ${timestamp}

## Results
`

  if (config.dryRun) {
    summary += `- Dry run: Would fix ${results.totalFixed} terminology issues in ${results.totalFiles} files\n`
  } else {
    summary += `- Fixed ${results.totalFixed} terminology issues in ${results.totalFiles} files\n`
  }
  
  if (config.codeOnly) {
    summary += `- Scope: Code files only\n`
  } else if (config.docsOnly) {
    summary += `- Scope: Documentation files only\n`
  } else {
    summary += `- Scope: All files\n`
  }
  
  summary += `- Mode: ${config.interactive ? 'Interactive' : 'Automatic'}\n`
  
  summary += `
## Next Steps

1. Run the terminology checker again to verify all issues have been fixed:
   \`node scripts/terminology-checker.js\`
   
2. Update your CI/CD pipeline to include terminology checking as part of the build process

3. Consider creating an automated pre-commit hook to check for terminology consistency

## Terminology Resources

- Terminology definitions: ${config.termsFile}
- Latest terminology report: ${config.inputFile}
`

  return summary
}

// Main function
async function main() {
  parseArgs()
  
  const mode = config.dryRun ? 'dry run' : (config.interactive ? 'interactive' : 'automatic')
  log(`Starting terminology fixer in ${mode} mode...`, 'info')
  
  if (!fs.existsSync(config.inputFile)) {
    log(`Input file not found: ${config.inputFile}`, 'error')
    process.exit(1)
  }
  
  log(`Loading issues from ${config.inputFile}`, 'info')
  
  // Determine report format and extract issues
  let issues
  
  try {
    if (config.inputFile.endsWith('.json')) {
      issues = extractIssuesFromJson()
    } else {
      issues = extractIssuesFromMarkdown()
    }
  } catch (error) {
    log(`Error extracting issues: ${error.message}`, 'error')
    process.exit(1)
  }
  
  // Count total issues
  const totalIssues = 
    Object.values(issues.code).reduce((sum, fileIssues) => sum + fileIssues.length, 0) +
    Object.values(issues.docs).reduce((sum, fileIssues) => sum + fileIssues.length, 0)
  
  if (totalIssues === 0) {
    log(`No terminology issues found in ${config.inputFile}`, 'info')
    process.exit(0)
  }
  
  log(`Found ${totalIssues} terminology issues to fix`, 'info')
  
  // Fix issues
  const results = await fixIssues(issues)
  
  // Generate and save summary report
  const summaryReport = generateSummaryReport(results)
  const summaryPath = path.join(
    path.dirname(config.inputFile),
    `terminology-fix-summary-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`
  )
  
  fs.writeFileSync(summaryPath, summaryReport)
  log(`Summary report saved to ${summaryPath}`, 'success')
  
  if (config.dryRun) {
    log(`Dry run completed. Would fix ${results.totalFixed} issues in ${results.totalFiles} files.`, 'success')
  } else {
    log(`Fixing completed. Fixed ${results.totalFixed} issues in ${results.totalFiles} files.`, 'success')
  }
}

// Run the script
main().catch(error => {
  log(`Error: ${error.message}`, 'error')
  process.exit(1)
})