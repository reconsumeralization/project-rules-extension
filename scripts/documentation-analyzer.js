#!/usr/bin/env node

/**
 * Documentation Analyzer
 * 
 * This script analyzes the codebase and documentation to identify disconnects,
 * inconsistencies, and missing documentation.
 * 
 * Usage:
 *   node documentation-analyzer.js [options]
 * 
 * Options:
 *   --code-dir=<path>        Directory containing code files (default: ./scripts)
 *   --docs-dir=<path>        Directory containing documentation (default: ./docs)
 *   --output=<path>          Output file for results (default: ./docs/taskmaster/fixes/documentation-analysis.md)
 *   --format=<format>        Output format: markdown, json, html (default: markdown)
 *   --features-only          Only analyze feature documentation coverage
 *   --scripts-only           Only analyze npm script documentation coverage
 *   --verbose                Show detailed logs during analysis
 *   --help                   Show this help message
 *
 * Example:
 *   node documentation-analyzer.js --code-dir=./src --docs-dir=./documentation --output=./report.md
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Default configuration
const config = {
  codeDir: './scripts',
  docsDir: './docs',
  outputFile: './docs/taskmaster/fixes/documentation-analysis.md',
  format: 'markdown',
  featuresOnly: false,
  scriptsOnly: false,
  verbose: false
}

// Parse command line arguments
function parseArgs() {
  process.argv.slice(2).forEach(arg => {
    if (arg === '--help') {
      showHelp()
      process.exit(0)
    }
    if (arg === '--verbose') {
      config.verbose = true
      return
    }
    if (arg === '--features-only') {
      config.featuresOnly = true
      return
    }
    if (arg === '--scripts-only') {
      config.scriptsOnly = true
      return
    }

    const match = arg.match(/^--([^=]+)=(.+)$/)
    if (match) {
      const [, key, value] = match
      switch (key) {
        case 'code-dir':
          config.codeDir = value
          break
        case 'docs-dir':
          config.docsDir = value
          break
        case 'output':
          config.outputFile = value
          break
        case 'format':
          if (['markdown', 'json', 'html'].includes(value)) {
            config.format = value
          } else {
            log(`Warning: Unsupported format '${value}'. Using 'markdown' instead.`, 'warn')
          }
          break
      }
    }
  })

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(config.outputFile)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
}

function showHelp() {
  const helpText = fs.readFileSync(__filename, 'utf8')
    .split('\n')
    .slice(1, 20)
    .map(line => line.replace(/^\s*\* ?/, ''))
    .join('\n')
  
  console.log(helpText)
}

function log(message, level = 'info') {
  const colors = {
    info: '\x1b[34m', // blue
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    success: '\x1b[32m', // green
    reset: '\x1b[0m'
  }

  if (level === 'info' && !config.verbose) {return}
  
  console.log(`${colors[level]}[${level.toUpperCase()}]${colors.reset} ${message}`)
}

// Find all files in a directory with a specific extension
function findFiles(dir, extensions = ['.js', '.md'], exclude = []) {
  const results = []
  
  function traverse(currentPath) {
    const files = fs.readdirSync(currentPath)
    
    for (const file of files) {
      const filePath = path.join(currentPath, file)
      const relativePath = path.relative(process.cwd(), filePath)
      const stat = fs.statSync(filePath)
      
      // Skip excluded paths
      if (exclude.some(pattern => relativePath.includes(pattern))) {
        continue
      }
      
      if (stat.isDirectory()) {
        traverse(filePath)
      } else if (extensions.includes(path.extname(file))) {
        results.push(filePath)
      }
    }
  }
  
  if (fs.existsSync(dir)) {
    traverse(dir)
  } else {
    log(`Directory not found: ${dir}`, 'error')
  }
  
  return results
}

// Extract npm scripts from package.json
function getNpmScripts() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
    return packageJson.scripts || {}
  } catch (error) {
    log(`Error reading package.json: ${error.message}`, 'error')
    return {}
  }
}

// Find documentation references to npm scripts
function findDocumentedScripts(docFiles) {
  const documentedScripts = new Set()
  
  for (const file of docFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const scriptMatches = content.match(/`npm run ([\w:-]+)`/g) || []
    
    scriptMatches.forEach(match => {
      const script = match.match(/`npm run ([\w:-]+)`/)[1]
      documentedScripts.add(script)
    })
  }
  
  return documentedScripts
}

// Extract feature exports and function names from code files
function extractCodeFeatures(codeFiles) {
  const features = []
  
  for (const file of codeFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const basename = path.basename(file, path.extname(file))
    
    // Find exported functions (both module.exports and exports.*)
    const exportMatches = content.match(/exports\.(\w+)\s*=|module\.exports\s*=\s*{([^}]+)}/g) || []
    
    // Find function declarations
    const functionMatches = content.match(/function\s+(\w+)\s*\(/g) || []
    
    // Find command line args that might indicate features
    const argMatches = content.match(/--([a-zA-Z0-9-]+)/g) || []
    
    const fileFeatures = {
      file,
      basename,
      exports: [],
      functions: [],
      commandArgs: []
    }
    
    exportMatches.forEach(match => {
      if (match.includes('module.exports')) {
        const innerMatch = match.match(/module\.exports\s*=\s*{([^}]+)}/)
        if (innerMatch) {
          const exports = innerMatch[1].split(',')
            .map(exp => exp.trim().split(':')[0].trim())
            .filter(exp => exp.length > 0)
          
          fileFeatures.exports.push(...exports)
        }
      } else {
        const exportName = match.match(/exports\.(\w+)\s*=/)[1]
        fileFeatures.exports.push(exportName)
      }
    })
    
    functionMatches.forEach(match => {
      const funcName = match.match(/function\s+(\w+)\s*\(/)[1]
      fileFeatures.functions.push(funcName)
    })
    
    argMatches.forEach(match => {
      const arg = match.match(/--([a-zA-Z0-9-]+)/)[1]
      fileFeatures.commandArgs.push(arg)
    })
    
    features.push(fileFeatures)
  }
  
  return features
}

// Find feature references in documentation
function findDocumentedFeatures(docFiles, codeFeatures) {
  const results = []
  
  const flattenedFeatures = codeFeatures.flatMap(file => {
    return [
      ...file.exports.map(exp => ({ type: 'export', name: exp, file: file.file })),
      ...file.functions.map(func => ({ type: 'function', name: func, file: file.file })),
      ...file.commandArgs.map(arg => ({ type: 'commandArg', name: arg, file: file.file }))
    ]
  })
  
  for (const feature of flattenedFeatures) {
    const referencedIn = []
    
    for (const docFile of docFiles) {
      const content = fs.readFileSync(docFile, 'utf8')
      
      // For exports and functions, look for mentions with code formatting
      if (['export', 'function'].includes(feature.type)) {
        const pattern = new RegExp(`\`${feature.name}\`|\\b${feature.name}\\(`, 'g')
        if (pattern.test(content)) {
          referencedIn.push(docFile)
        }
      }
      
      // For command line args, look for mentions with -- prefix
      if (feature.type === 'commandArg') {
        const pattern = new RegExp(`--${feature.name}\\b`, 'g')
        if (pattern.test(content)) {
          referencedIn.push(docFile)
        }
      }
    }
    
    results.push({
      ...feature,
      documented: referencedIn.length > 0,
      references: referencedIn
    })
  }
  
  return results
}

// Analyze consistency between package scripts and their documentation
function analyzeScriptConsistency() {
  log('Analyzing npm script documentation consistency...', 'info')
  
  const scripts = getNpmScripts()
  const docFiles = findFiles(config.docsDir, ['.md'])
  const documentedScripts = findDocumentedScripts(docFiles)
  
  const scriptAnalysis = {
    total: Object.keys(scripts).length,
    documented: 0,
    undocumented: [],
    nonexistent: []
  }
  
  // Check for undocumented scripts
  Object.keys(scripts).forEach(script => {
    if (documentedScripts.has(script)) {
      scriptAnalysis.documented++
    } else {
      scriptAnalysis.undocumented.push(script)
    }
  })
  
  // Check for scripts in docs that don't exist
  documentedScripts.forEach(script => {
    if (!scripts[script]) {
      scriptAnalysis.nonexistent.push(script)
    }
  })
  
  return scriptAnalysis
}

// Analyze feature documentation coverage
function analyzeFeatureDocumentation() {
  log('Analyzing feature documentation coverage...', 'info')
  
  const codeFiles = findFiles(config.codeDir, ['.js'])
  const docFiles = findFiles(config.docsDir, ['.md'])
  
  const codeFeatures = extractCodeFeatures(codeFiles)
  const documentedFeatures = findDocumentedFeatures(docFiles, codeFeatures)
  
  const featureAnalysis = {
    total: documentedFeatures.length,
    documented: documentedFeatures.filter(f => f.documented).length,
    undocumented: documentedFeatures.filter(f => !f.documented),
    byFile: {}
  }
  
  // Group by file for better reporting
  documentedFeatures.forEach(feature => {
    const relativePath = path.relative(process.cwd(), feature.file)
    
    if (!featureAnalysis.byFile[relativePath]) {
      featureAnalysis.byFile[relativePath] = {
        documented: 0,
        undocumented: 0,
        features: []
      }
    }
    
    if (feature.documented) {
      featureAnalysis.byFile[relativePath].documented++
    } else {
      featureAnalysis.byFile[relativePath].undocumented++
    }
    
    featureAnalysis.byFile[relativePath].features.push(feature)
  })
  
  return featureAnalysis
}

// Generate markdown report
function generateMarkdownReport(scriptAnalysis, featureAnalysis) {
  log('Generating markdown report...', 'info')
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  let markdown = `# Documentation Analysis Report

Generated on: ${new Date().toLocaleString()}

## Summary

`

  // Script analysis summary
  if (scriptAnalysis) {
    const scriptDocRate = ((scriptAnalysis.documented / scriptAnalysis.total) * 100).toFixed(1)
    
    markdown += `### npm Scripts Documentation
- Total scripts: ${scriptAnalysis.total}
- Documented scripts: ${scriptAnalysis.documented} (${scriptDocRate}%)
- Undocumented scripts: ${scriptAnalysis.undocumented.length}
- Non-existent scripts referenced in docs: ${scriptAnalysis.nonexistent.length}

`
  }

  // Feature analysis summary
  if (featureAnalysis) {
    const featureDocRate = ((featureAnalysis.documented / featureAnalysis.total) * 100).toFixed(1)
    
    markdown += `### Feature Documentation
- Total features detected: ${featureAnalysis.total}
- Documented features: ${featureAnalysis.documented} (${featureDocRate}%)
- Undocumented features: ${featureAnalysis.undocumented.length}

`
  }

  // Detailed script analysis
  if (scriptAnalysis && scriptAnalysis.undocumented.length > 0) {
    markdown += `## Undocumented npm Scripts

The following npm scripts are not referenced in any documentation:

| Script | Command |
| ------ | ------- |
`
    
    const scripts = getNpmScripts()
    scriptAnalysis.undocumented.forEach(script => {
      markdown += `| \`${script}\` | \`${scripts[script]}\` |\n`
    })
    
    markdown += '\n'
  }

  // Non-existent scripts
  if (scriptAnalysis && scriptAnalysis.nonexistent.length > 0) {
    markdown += `## Non-existent npm Scripts Referenced in Documentation

The following npm scripts are referenced in documentation but don't exist in package.json:

`
    
    scriptAnalysis.nonexistent.forEach(script => {
      markdown += `- \`${script}\`\n`
    })
    
    markdown += '\n'
  }

  // Detailed feature analysis
  if (featureAnalysis) {
    markdown += `## Feature Documentation Analysis

Documentation coverage by file:

| File | Documented | Undocumented | Coverage |
| ---- | ---------- | ------------ | -------- |
`
    
    Object.entries(featureAnalysis.byFile).forEach(([file, stats]) => {
      const total = stats.documented + stats.undocumented
      const coverage = ((stats.documented / total) * 100).toFixed(1)
      markdown += `| ${file} | ${stats.documented} | ${stats.undocumented} | ${coverage}% |\n`
    })
    
    markdown += '\n## Undocumented Features\n\n'
    
    Object.entries(featureAnalysis.byFile).forEach(([file, stats]) => {
      if (stats.undocumented > 0) {
        markdown += `### ${file}\n\n`
        
        const undocumented = stats.features.filter(f => !f.documented)
        
        // Group by type
        const byType = {
          export: undocumented.filter(f => f.type === 'export'),
          function: undocumented.filter(f => f.type === 'function'),
          commandArg: undocumented.filter(f => f.type === 'commandArg')
        }
        
        if (byType.export.length > 0) {
          markdown += 'Exported features:\n'
          byType.export.forEach(f => {
            markdown += `- \`${f.name}\`\n`
          })
          markdown += '\n'
        }
        
        if (byType.function.length > 0) {
          markdown += 'Functions:\n'
          byType.function.forEach(f => {
            markdown += `- \`${f.name}()\`\n`
          })
          markdown += '\n'
        }
        
        if (byType.commandArg.length > 0) {
          markdown += 'Command line arguments:\n'
          byType.commandArg.forEach(f => {
            markdown += `- \`--${f.name}\`\n`
          })
          markdown += '\n'
        }
      }
    })
  }

  // Recommendations
  markdown += `## Recommendations

1. **Address Undocumented Features**: Add documentation for all undocumented features, especially those with high usage.
2. **Fix Documentation References**: Update documentation to remove references to non-existent npm scripts.
3. **Improve Documentation Coverage**: Focus on improving documentation for files with low coverage percentages.
4. **Consistency Check**: Ensure terminology is consistent across all documentation.
5. **Automated Testing**: Consider implementing automated tests to verify documentation coverage.

## Next Steps

1. Run the terminology checker to identify inconsistent terminology
2. Update documentation for undocumented features
3. Remove references to non-existent scripts
4. Implement documentation quality checks in CI/CD pipeline
`

  return markdown
}

// Generate JSON report
function generateJsonReport(scriptAnalysis, featureAnalysis) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    scriptAnalysis,
    featureAnalysis
  }, null, 2)
}

// Generate HTML report
function generateHtmlReport(scriptAnalysis, featureAnalysis) {
  const markdown = generateMarkdownReport(scriptAnalysis, featureAnalysis)
  
  // Simple markdown to HTML conversion (for basic elements only)
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #222; }
    h1 { border-bottom: 2px solid #eaecef; padding-bottom: 10px; }
    h2 { border-bottom: 1px solid #eaecef; padding-bottom: 5px; margin-top: 24px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ddd; }
    th { background-color: #f8f8f8; }
    code { background-color: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; }
    .summary-box { background-color: #f0f7fb; border-left: 5px solid #4285f4; padding: 15px; margin-bottom: 20px; }
    .warning { background-color: #fff8e6; border-left: 5px solid #f8c11c; padding: 15px; margin-bottom: 20px; }
  </style>
</head>
<body>
  ${markdown
    .replace(/^# (.*)/gm, '<h1>$1</h1>')
    .replace(/^## (.*)/gm, '<h2>$1</h2>')
    .replace(/^### (.*)/gm, '<h3>$1</h3>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^\| (.*) \|$/gm, function(match) {
      if (match.includes('---')) {
        return match
      }
      return '<tr>' + match.split('|').slice(1, -1).map(cell => `<td>${cell.trim()}</td>`).join('') + '</tr>'
    })
    .replace(/^\| (.*) \|$/gm, function(match) {
      if (match.includes('---')) {
        return ''
      }
      return match
    })
    .replace(/(\| [^|]+ \|[^\n]*\n){2,}(?!\| ---)/gm, function(match) {
      const rows = match.trim().split('\n')
      const headers = rows[0].split('|').slice(1, -1).map(h => h.trim())
      
      let table = '<table><thead><tr>'
      headers.forEach(header => {
        table += `<th>${header}</th>`
      })
      table += '</tr></thead><tbody>'
      
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split('|').slice(1, -1).map(cell => cell.trim())
        table += '<tr>'
        cells.forEach(cell => {
          table += `<td>${cell}</td>`
        })
        table += '</tr>'
      }
      
      table += '</tbody></table>'
      return table
    })
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*\n)+/g, function(match) {
      return '<ul>' + match + '</ul>'
    })
    .replace(/<\/ul>\n<ul>/g, '')
    .replace(/^(\d+)\. (.*)/gm, '<li>$2</li>')
    .replace(/(<li>.*\n)+/g, function(match) {
      if (match.match(/^\d+\./m)) {
        return '<ol>' + match + '</ol>'
      }
      return match
    })
    .replace(/<\/ol>\n<ol>/g, '')
    .replace(/^(?!<)(.+)(?!>)$/gm, '<p>$1</p>')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>(\s*<(h1|h2|h3|ul|ol|li|table)>)/g, '$1')
    .replace(/(<\/(h1|h2|h3|ul|ol|li|table)>)\s*<\/p>/g, '$1')
  }
</body>
</html>`

  return html
}

// Save report to file
function saveReport(content) {
  try {
    fs.writeFileSync(config.outputFile, content)
    log(`Report saved to ${config.outputFile}`, 'success')
  } catch (error) {
    log(`Error saving report: ${error.message}`, 'error')
  }
}

// Main function
async function main() {
  parseArgs()
  
  log(`Starting documentation analysis...`, 'info')
  log(`Code directory: ${config.codeDir}`, 'info')
  log(`Docs directory: ${config.docsDir}`, 'info')
  log(`Output file: ${config.outputFile}`, 'info')
  
  let scriptAnalysis = null
  let featureAnalysis = null
  
  if (!config.featuresOnly) {
    scriptAnalysis = analyzeScriptConsistency()
    log(`Found ${scriptAnalysis.total} npm scripts, ${scriptAnalysis.documented} documented (${((scriptAnalysis.documented / scriptAnalysis.total) * 100).toFixed(1)}%)`, 'info')
  }
  
  if (!config.scriptsOnly) {
    featureAnalysis = analyzeFeatureDocumentation()
    log(`Found ${featureAnalysis.total} code features, ${featureAnalysis.documented} documented (${((featureAnalysis.documented / featureAnalysis.total) * 100).toFixed(1)}%)`, 'info')
  }
  
  let report
  switch (config.format) {
    case 'json':
      report = generateJsonReport(scriptAnalysis, featureAnalysis)
      break
    case 'html':
      report = generateHtmlReport(scriptAnalysis, featureAnalysis)
      break
    case 'markdown':
    default:
      report = generateMarkdownReport(scriptAnalysis, featureAnalysis)
  }
  
  saveReport(report)
  log('Analysis complete', 'success')
}

// Run the script
main().catch(error => {
  log(`Error: ${error.message}`, 'error')
  process.exit(1)
}) 