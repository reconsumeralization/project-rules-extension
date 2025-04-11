#!/usr/bin/env node

/**
 * Documentation Analysis Tool
 * 
 * This script analyzes documentation for disconnects, inconsistencies, and gaps.
 * It can scan directories, analyze files, and generate reports.
 * 
 * Usage:
 *   node doc-analysis-tool.js [options]
 * 
 * Options:
 *   --dir=<directory>         Directory to scan (default: ./docs)
 *   --exclude=<pattern>       Exclude files matching pattern (glob)
 *   --output=<file>           Output file for the report (default: doc-analysis-report.md)
 *   --format=<format>         Output format: md, json, html (default: md)
 *   --check-links             Check for broken links
 *   --check-references        Check for inconsistent references
 *   --check-terminology       Check for inconsistent terminology
 *   --check-structure         Check for structural issues
 *   --check-completeness      Check for documentation completeness
 *   --check-all               Check everything (default)
 *   --verbose                 Show detailed information
 *   --quiet                   Suppress output except errors
 *   --help                    Show this help message
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')
const chalk = require('chalk')
const { execSync } = require('child_process')
const markdownLint = require('markdownlint')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  dir: './docs',
  exclude: null,
  output: 'doc-analysis-report.md',
  format: 'md',
  checkLinks: false,
  checkReferences: false,
  checkTerminology: false,
  checkStructure: false,
  checkCompleteness: false,
  checkAll: true,
  verbose: false,
  quiet: false,
  help: false
}

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.substring(6)
  } else if (arg.startsWith('--exclude=')) {
    options.exclude = arg.substring(10)
  } else if (arg.startsWith('--output=')) {
    options.output = arg.substring(9)
  } else if (arg.startsWith('--format=')) {
    options.format = arg.substring(9)
  } else if (arg === '--check-links') {
    options.checkLinks = true
    options.checkAll = false
  } else if (arg === '--check-references') {
    options.checkReferences = true
    options.checkAll = false
  } else if (arg === '--check-terminology') {
    options.checkTerminology = true
    options.checkAll = false
  } else if (arg === '--check-structure') {
    options.checkStructure = true
    options.checkAll = false
  } else if (arg === '--check-completeness') {
    options.checkCompleteness = true
    options.checkAll = false
  } else if (arg === '--check-all') {
    options.checkAll = true
  } else if (arg === '--verbose') {
    options.verbose = true
  } else if (arg === '--quiet') {
    options.quiet = true
  } else if (arg === '--help') {
    options.help = true
  }
})

// Show help message
if (options.help) {
  const helpText = fs.readFileSync(__filename, 'utf8')
  const commentRegex = /\/\*\*([\s\S]*?)\*\//
  const match = helpText.match(commentRegex)
  if (match && match[1]) {
    console.log(match[1].split('\n').map(line => line.replace(/^\s*\*\s?/, '')).join('\n'))
  } else {
    console.log('Usage: node doc-analysis-tool.js [options]')
  }
  process.exit(0)
}

// Print message with option to suppress if quiet
function log(message, force = false) {
  if (!options.quiet || force) {
    console.log(message)
  }
}

// Log with color based on level
function logLevel(message, level = 'info') {
  if (options.quiet) {return}

  switch (level) {
    case 'info':
      console.log(chalk.blue('ℹ ') + message)
      break
    case 'success':
      console.log(chalk.green('✓ ') + message)
      break
    case 'warning':
      console.log(chalk.yellow('⚠ ') + message)
      break
    case 'error':
      console.log(chalk.red('✖ ') + message)
      break
    default:
      console.log(message)
  }
}

// Get all documentation files
function getDocFiles() {
  const pattern = path.join(options.dir, '**/*.md')
  const excludePattern = options.exclude ? options.exclude : null
  
  logLevel(`Scanning directory: ${options.dir}`, 'info')
  
  const files = glob.sync(pattern, { 
    ignore: excludePattern ? [excludePattern] : [],
    nodir: true
  })
  
  logLevel(`Found ${files.length} documentation files`, 'info')
  
  if (options.verbose) {
    files.forEach(file => {
      logLevel(`  ${file}`, 'info')
    })
  }
  
  return files
}

// Get related code files referenced in docs
function getReferencedCodeFiles(docFiles) {
  const codeFiles = new Set()
  const codeReferences = {}
  
  logLevel('Finding code files referenced in documentation', 'info')
  
  docFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    const fileRefs = []
    
    // Find code references in markdown code blocks
    // Look for references to files like `filename.js` or ```javascript filename.js
    const codeBlockRegex = /```(?:javascript|js|typescript|ts|jsx|tsx)?\s+([a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)/g
    let match
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const codeFile = match[1]
      codeFiles.add(codeFile)
      fileRefs.push(codeFile)
    }
    
    // Find inline code references
    const inlineCodeRegex = /`([a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)`/g
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      const codeFile = match[1]
      if (codeFile.includes('.')) { // Likely a file, not just a variable
        codeFiles.add(codeFile)
        fileRefs.push(codeFile)
      }
    }
    
    if (fileRefs.length > 0) {
      codeReferences[file] = fileRefs
    }
  })
  
  logLevel(`Found ${codeFiles.size} referenced code files`, 'info')
  
  if (options.verbose) {
    Object.entries(codeReferences).forEach(([docFile, refs]) => {
      logLevel(`  ${docFile} references:`, 'info')
      refs.forEach(ref => {
        logLevel(`    ${ref}`, 'info')
      })
    })
  }
  
  return { codeFiles: Array.from(codeFiles), codeReferences }
}

// Check if referenced code files exist
function checkCodeReferences(codeReferences) {
  logLevel('Checking code references...', 'info')
  
  const issues = []
  
  Object.entries(codeReferences).forEach(([docFile, refs]) => {
    refs.forEach(ref => {
      // Check if file exists relative to root, doc directory, or absolutely
      const locations = [
        path.join(process.cwd(), ref),
        path.join(process.cwd(), options.dir, ref),
        path.join(path.dirname(docFile), ref)
      ]
      
      const exists = locations.some(loc => fs.existsSync(loc))
      
      if (!exists) {
        issues.push({
          type: 'broken_reference',
          docFile,
          reference: ref,
          message: `Referenced file does not exist: ${ref}`
        })
        
        if (options.verbose) {
          logLevel(`  ${docFile}: Referenced file not found: ${ref}`, 'warning')
        }
      }
    })
  })
  
  logLevel(`Found ${issues.length} broken code references`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Check for links between documentation files
function checkDocLinks(docFiles) {
  logLevel('Checking documentation links...', 'info')
  
  const issues = []
  
  docFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    
    // Find markdown links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    let match
    
    while ((match = linkRegex.exec(content)) !== null) {
      const [, linkText, linkTarget] = match
      
      // Skip external links
      if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) {
        continue
      }
      
      // Check if link target exists
      let targetPath
      if (linkTarget.startsWith('/')) {
        // Absolute path from documentation root
        targetPath = path.join(options.dir, linkTarget)
      } else {
        // Relative path
        targetPath = path.join(path.dirname(file), linkTarget)
      }
      
      // Handle anchor links by removing the #section part
      const basePath = targetPath.split('#')[0]
      
      if (basePath && !fs.existsSync(basePath)) {
        issues.push({
          type: 'broken_link',
          docFile: file,
          linkText,
          linkTarget,
          message: `Broken link: ${linkText} -> ${linkTarget}`
        })
        
        if (options.verbose) {
          logLevel(`  ${file}: Broken link: ${linkText} -> ${linkTarget}`, 'warning')
        }
      }
    }
  })
  
  logLevel(`Found ${issues.length} broken links`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Check documentation structure
function checkDocStructure(docFiles) {
  logLevel('Checking documentation structure...', 'info')
  
  const issues = []
  
  // Check for directory structure
  const directories = new Set()
  docFiles.forEach(file => {
    const dir = path.dirname(file)
    directories.add(dir)
  })
  
  // Check for README files in each directory
  directories.forEach(dir => {
    const readmePath = path.join(dir, 'README.md')
    if (!fs.existsSync(readmePath)) {
      issues.push({
        type: 'missing_readme',
        directory: dir,
        message: `Directory missing README.md: ${dir}`
      })
      
      if (options.verbose) {
        logLevel(`  Directory missing README.md: ${dir}`, 'warning')
      }
    }
  })
  
  // Check markdown structure
  docFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    
    // Check for title (h1) at the beginning
    let hasTitle = false
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].startsWith('# ')) {
        hasTitle = true
        break
      }
    }
    
    if (!hasTitle && path.basename(file) !== 'README.md') {
      issues.push({
        type: 'missing_title',
        docFile: file,
        message: `Document missing title (h1): ${file}`
      })
      
      if (options.verbose) {
        logLevel(`  Document missing title (h1): ${file}`, 'warning')
      }
    }
    
    // Check heading hierarchy
    const headings = []
    lines.forEach(line => {
      if (line.startsWith('#')) {
        const level = line.indexOf(' ')
        if (level > 0) {
          headings.push(level)
        }
      }
    })
    
    // Check for heading level jumps (e.g. h1 -> h3)
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i-1] + 1) {
        issues.push({
          type: 'heading_hierarchy',
          docFile: file,
          message: `Heading level jump in ${file}: h${headings[i-1]} -> h${headings[i]}`
        })
        
        if (options.verbose) {
          logLevel(`  Heading level jump in ${file}: h${headings[i-1]} -> h${headings[i]}`, 'warning')
        }
      }
    }
  })
  
  logLevel(`Found ${issues.length} structure issues`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Check for completeness and gaps in documentation
function checkCompleteness(docFiles, codeFiles) {
  logLevel('Checking documentation completeness...', 'info')
  
  const issues = []
  
  // Find script files in the project
  const scriptFiles = glob.sync('scripts/**/*.js', { nodir: true })
  const scriptBasenames = scriptFiles.map(file => path.basename(file))
  
  // Check if all scripts are documented
  scriptFiles.forEach(scriptFile => {
    const scriptName = path.basename(scriptFile)
    const isDocumented = codeFiles.some(codeFile => 
      codeFile === scriptFile || 
      codeFile === scriptName
    )
    
    if (!isDocumented) {
      issues.push({
        type: 'undocumented_script',
        scriptFile,
        message: `Script not documented: ${scriptFile}`
      })
      
      if (options.verbose) {
        logLevel(`  Script not documented: ${scriptFile}`, 'warning')
      }
    }
  })
  
  // Check if documentation has examples
  docFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    
    // Check for code examples
    const hasCodeExamples = content.includes('```')
    
    if (!hasCodeExamples) {
      issues.push({
        type: 'missing_examples',
        docFile: file,
        message: `Document missing code examples: ${file}`
      })
      
      if (options.verbose) {
        logLevel(`  Document missing code examples: ${file}`, 'warning')
      }
    }
    
    // Check for usage or getting started section
    const hasUsageSection = content.toLowerCase().includes('# usage') || 
                           content.toLowerCase().includes('## usage') ||
                           content.toLowerCase().includes('# getting started') ||
                           content.toLowerCase().includes('## getting started')
    
    if (!hasUsageSection) {
      issues.push({
        type: 'missing_usage',
        docFile: file,
        message: `Document missing usage/getting started section: ${file}`
      })
      
      if (options.verbose) {
        logLevel(`  Document missing usage/getting started section: ${file}`, 'warning')
      }
    }
  })
  
  logLevel(`Found ${issues.length} completeness issues`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Check for terminology consistency
function checkTerminology(docFiles) {
  logLevel('Checking terminology consistency...', 'info')
  
  const issues = []
  const termCounts = {}
  
  // Collect terminology variations
  docFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    
    // Look for common terminology variations
    const variations = [
      ['taskmaster', 'task master', 'task-master'],
      ['MCP', 'mcp', 'M.C.P.', 'M.C.P'],
      ['workflow', 'work flow', 'work-flow'],
      ['tradeoff', 'trade off', 'trade-off'],
      ['documentation', 'docs', 'doc'],
      ['JavaScript', 'Javascript', 'javascript'],
      ['TypeScript', 'Typescript', 'typescript']
    ]
    
    variations.forEach(termSet => {
      termSet.forEach(term => {
        // Count occurrences using case-insensitive regex
        const regex = new RegExp(`\\b${term}\\b`, 'gi')
        const matches = content.match(regex)
        
        if (matches) {
          if (!termCounts[termSet[0]]) {
            termCounts[termSet[0]] = {}
          }
          
          if (!termCounts[termSet[0]][term]) {
            termCounts[termSet[0]][term] = 0
          }
          
          termCounts[termSet[0]][term] += matches.length
        }
      })
    })
  })
  
  // Check for inconsistent terminology
  Object.entries(termCounts).forEach(([canonicalTerm, variations]) => {
    const terms = Object.keys(variations)
    
    if (terms.length > 1) {
      // Find the most common variation
      const mostCommon = terms.reduce((a, b) => 
        variations[a] > variations[b] ? a : b
      )
      
      // Add issues for non-canonical terms
      terms.forEach(term => {
        if (term !== canonicalTerm) {
          issues.push({
            type: 'inconsistent_terminology',
            canonicalTerm,
            variantTerm: term,
            count: variations[term],
            message: `Inconsistent terminology: '${term}' used ${variations[term]} times, canonical form is '${canonicalTerm}'`
          })
          
          if (options.verbose) {
            logLevel(`  Inconsistent terminology: '${term}' used ${variations[term]} times, canonical form is '${canonicalTerm}'`, 'warning')
          }
        }
      })
    }
  })
  
  logLevel(`Found ${issues.length} terminology inconsistencies`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Run markdown linting
function lintMarkdown(docFiles) {
  logLevel('Running markdown linting...', 'info')
  
  const issues = []
  
  const options = {
    files: docFiles,
    config: {
      default: true,
      "line-length": false, // Don't enforce line length
      "no-duplicate-heading": { siblings_only: true } // Allow duplicate headings in different sections
    }
  }
  
  const result = markdownLint.sync(options)
  
  Object.entries(result).forEach(([file, fileIssues]) => {
    fileIssues.forEach(issue => {
      issues.push({
        type: 'markdown_lint',
        docFile: file,
        rule: issue.ruleAlias || issue.ruleName,
        line: issue.lineNumber,
        message: `${issue.ruleDescription} at line ${issue.lineNumber}: ${issue.ruleInformation}`
      })
      
      if (options.verbose) {
        logLevel(`  ${file}:${issue.lineNumber}: ${issue.ruleDescription}`, 'warning')
      }
    })
  })
  
  logLevel(`Found ${issues.length} markdown lint issues`, issues.length > 0 ? 'warning' : 'success')
  
  return issues
}

// Generate report based on the analysis
function generateReport(allIssues) {
  const output = options.output
  logLevel(`Generating report: ${output}`, 'info')
  
  const reportData = {
    total: allIssues.length,
    byType: {},
    byFile: {},
    issues: allIssues
  }
  
  // Group issues by type
  allIssues.forEach(issue => {
    if (!reportData.byType[issue.type]) {
      reportData.byType[issue.type] = []
    }
    reportData.byType[issue.type].push(issue)
  })
  
  // Group issues by file
  allIssues.forEach(issue => {
    const file = issue.docFile || issue.scriptFile || issue.directory || 'unknown'
    if (!reportData.byFile[file]) {
      reportData.byFile[file] = []
    }
    reportData.byFile[file].push(issue)
  })
  
  let report = ''
  
  if (options.format === 'md') {
    report = generateMarkdownReport(reportData)
  } else if (options.format === 'json') {
    report = JSON.stringify(reportData, null, 2)
  } else if (options.format === 'html') {
    report = generateHtmlReport(reportData)
  } else {
    logLevel(`Unknown format: ${options.format}, defaulting to markdown`, 'warning')
    report = generateMarkdownReport(reportData)
  }
  
  // Create directory if doesn't exist
  const outputDir = path.dirname(output)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  fs.writeFileSync(output, report)
  
  logLevel(`Report generated: ${output}`, 'success')
  
  return reportData
}

// Generate markdown report
function generateMarkdownReport(reportData) {
  const { total, byType, byFile, issues } = reportData
  
  let report = `# Documentation Analysis Report\n\n`
  report += `Generated: ${new Date().toISOString()}\n\n`
  report += `Total issues found: ${total}\n\n`
  
  // Summary by type
  report += `## Issues by Type\n\n`
  Object.entries(byType).forEach(([type, typeIssues]) => {
    report += `- **${formatIssueType(type)}**: ${typeIssues.length} issues\n`
  })
  report += `\n`
  
  // Issues by type
  Object.entries(byType).forEach(([type, typeIssues]) => {
    report += `## ${formatIssueType(type)} (${typeIssues.length})\n\n`
    
    typeIssues.forEach(issue => {
      const location = issue.docFile || issue.scriptFile || issue.directory || 'unknown'
      report += `- **${location}**: ${issue.message}\n`
    })
    
    report += `\n`
  })
  
  // Issues by file
  report += `## Issues by File\n\n`
  Object.entries(byFile).forEach(([file, fileIssues]) => {
    report += `### ${file} (${fileIssues.length})\n\n`
    
    fileIssues.forEach(issue => {
      report += `- **${formatIssueType(issue.type)}**: ${issue.message}\n`
    })
    
    report += `\n`
  })
  
  // Recommendations
  report += `## Recommendations\n\n`
  
  // Terminology recommendations
  const terminologyIssues = byType['inconsistent_terminology'] || []
  if (terminologyIssues.length > 0) {
    report += `### Terminology Standardization\n\n`
    report += `Consider standardizing the following terms:\n\n`
    
    const termMap = {}
    terminologyIssues.forEach(issue => {
      if (!termMap[issue.canonicalTerm]) {
        termMap[issue.canonicalTerm] = []
      }
      if (!termMap[issue.canonicalTerm].includes(issue.variantTerm)) {
        termMap[issue.canonicalTerm].push(issue.variantTerm)
      }
    })
    
    Object.entries(termMap).forEach(([canonical, variants]) => {
      report += `- Use "${canonical}" instead of: ${variants.map(v => `"${v}"`).join(', ')}\n`
    })
    
    report += `\n`
  }
  
  // Structure recommendations
  const structureIssues = (byType['missing_readme'] || []).concat(byType['heading_hierarchy'] || [])
  if (structureIssues.length > 0) {
    report += `### Documentation Structure\n\n`
    report += `- Ensure each directory has a README.md file\n`
    report += `- Maintain proper heading hierarchy (don't skip levels)\n`
    report += `- Ensure each document has a clear title (h1)\n\n`
  }
  
  // Completeness recommendations
  const completenessIssues = (byType['undocumented_script'] || []).concat(byType['missing_examples'] || []).concat(byType['missing_usage'] || [])
  if (completenessIssues.length > 0) {
    report += `### Documentation Completeness\n\n`
    report += `- Document all scripts in the codebase\n`
    report += `- Include code examples in all documentation files\n`
    report += `- Add usage or getting started sections to all documentation files\n\n`
  }
  
  // Link recommendations
  const linkIssues = (byType['broken_link'] || []).concat(byType['broken_reference'] || [])
  if (linkIssues.length > 0) {
    report += `### Fix Broken Links\n\n`
    report += `- Update or remove broken links between documentation files\n`
    report += `- Fix references to code files that don't exist\n\n`
  }
  
  return report
}

// Generate HTML report
function generateHtmlReport(reportData) {
  const { total, byType, byFile, issues } = reportData
  
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Documentation Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
    h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #3498db; margin-top: 30px; }
    h3 { color: #2980b9; }
    .summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .issue { margin-bottom: 10px; }
    .issue-type { font-weight: bold; color: #e74c3c; }
    .location { font-weight: bold; color: #2c3e50; }
    .recommendations { background: #e8f4fc; padding: 15px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Documentation Analysis Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total issues found: ${total}</p>
    
    <h3>Issues by Type</h3>
    <ul>
`
  
  Object.entries(byType).forEach(([type, typeIssues]) => {
    html += `      <li><strong>${formatIssueType(type)}</strong>: ${typeIssues.length} issues</li>\n`
  })
  
  html += `    </ul>
  </div>
  
  <h2>Issues by Type</h2>
`
  
  Object.entries(byType).forEach(([type, typeIssues]) => {
    html += `  <h3>${formatIssueType(type)} (${typeIssues.length})</h3>\n  <ul>\n`
    
    typeIssues.forEach(issue => {
      const location = issue.docFile || issue.scriptFile || issue.directory || 'unknown'
      html += `    <li class="issue"><span class="location">${location}</span>: ${issue.message}</li>\n`
    })
    
    html += `  </ul>\n`
  })
  
  html += `  <h2>Issues by File</h2>\n`
  
  Object.entries(byFile).forEach(([file, fileIssues]) => {
    html += `  <h3>${file} (${fileIssues.length})</h3>\n  <ul>\n`
    
    fileIssues.forEach(issue => {
      html += `    <li class="issue"><span class="issue-type">${formatIssueType(issue.type)}</span>: ${issue.message}</li>\n`
    })
    
    html += `  </ul>\n`
  })
  
  html += `  <div class="recommendations">
    <h2>Recommendations</h2>
`
  
  // Terminology recommendations
  const terminologyIssues = byType['inconsistent_terminology'] || []
  if (terminologyIssues.length > 0) {
    html += `    <h3>Terminology Standardization</h3>
    <p>Consider standardizing the following terms:</p>
    <ul>
`
    
    const termMap = {}
    terminologyIssues.forEach(issue => {
      if (!termMap[issue.canonicalTerm]) {
        termMap[issue.canonicalTerm] = []
      }
      if (!termMap[issue.canonicalTerm].includes(issue.variantTerm)) {
        termMap[issue.canonicalTerm].push(issue.variantTerm)
      }
    })
    
    Object.entries(termMap).forEach(([canonical, variants]) => {
      html += `      <li>Use "${canonical}" instead of: ${variants.map(v => `"${v}"`).join(', ')}</li>\n`
    })
    
    html += `    </ul>
`
  }
  
  // Structure recommendations
  const structureIssues = (byType['missing_readme'] || []).concat(byType['heading_hierarchy'] || [])
  if (structureIssues.length > 0) {
    html += `    <h3>Documentation Structure</h3>
    <ul>
      <li>Ensure each directory has a README.md file</li>
      <li>Maintain proper heading hierarchy (don't skip levels)</li>
      <li>Ensure each document has a clear title (h1)</li>
    </ul>
`
  }
  
  // Completeness recommendations
  const completenessIssues = (byType['undocumented_script'] || []).concat(byType['missing_examples'] || []).concat(byType['missing_usage'] || [])
  if (completenessIssues.length > 0) {
    html += `    <h3>Documentation Completeness</h3>
    <ul>
      <li>Document all scripts in the codebase</li>
      <li>Include code examples in all documentation files</li>
      <li>Add usage or getting started sections to all documentation files</li>
    </ul>
`
  }
  
  // Link recommendations
  const linkIssues = (byType['broken_link'] || []).concat(byType['broken_reference'] || [])
  if (linkIssues.length > 0) {
    html += `    <h3>Fix Broken Links</h3>
    <ul>
      <li>Update or remove broken links between documentation files</li>
      <li>Fix references to code files that don't exist</li>
    </ul>
`
  }
  
  html += `  </div>
</body>
</html>`
  
  return html
}

// Format issue type to be more readable
function formatIssueType(type) {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Main function
async function main() {
  // Get all documentation files
  const docFiles = getDocFiles()
  
  // Get referenced code files
  const { codeFiles, codeReferences } = getReferencedCodeFiles(docFiles)
  
  // Initialize issues array
  let allIssues = []
  
  // Run checks based on options
  if (options.checkAll || options.checkReferences) {
    allIssues = allIssues.concat(checkCodeReferences(codeReferences))
  }
  
  if (options.checkAll || options.checkLinks) {
    allIssues = allIssues.concat(checkDocLinks(docFiles))
  }
  
  if (options.checkAll || options.checkStructure) {
    allIssues = allIssues.concat(checkDocStructure(docFiles))
  }
  
  if (options.checkAll || options.checkCompleteness) {
    allIssues = allIssues.concat(checkCompleteness(docFiles, codeFiles))
  }
  
  if (options.checkAll || options.checkTerminology) {
    allIssues = allIssues.concat(checkTerminology(docFiles))
  }
  
  // Try to run markdown linting if markdownlint is available
  try {
    if (markdownLint) {
      allIssues = allIssues.concat(lintMarkdown(docFiles))
    }
  } catch (error) {
    logLevel('Markdown linting not available, skipping', 'warning')
  }
  
  // Generate report
  const reportData = generateReport(allIssues)
  
  // Print summary
  log(`\n${chalk.bold('Documentation Analysis Summary')}`, true)
  log(`${chalk.bold('Total issues found:')} ${reportData.total}`, true)
  
  Object.entries(reportData.byType).forEach(([type, issues]) => {
    const color = issues.length > 0 ? chalk.yellow : chalk.green
    log(`${chalk.bold(formatIssueType(type))}: ${color(issues.length)}`, true)
  })
  
  log(`\nFull report saved to: ${options.output}`, true)
  
  // Return with exit code based on issues
  return reportData.total > 0 ? 1 : 0
}

// Run the main function
main().then(exitCode => {
  if (!options.quiet) {
    process.exit(exitCode)
  }
}).catch(error => {
  console.error(chalk.red('Error:'), error)
  process.exit(1)
}) 