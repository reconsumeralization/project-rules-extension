#!/usr/bin/env node

/**
 * Tradeoff Analysis Documentation Verification
 * 
 * This script verifies that the tradeoff analysis documentation is consistent
 * with the actual implementation in the code.
 * 
 * Usage:
 *   node scripts/verify-tradeoff-docs.js [options]
 * 
 * Options:
 *   --verbose             Show detailed logs during verification
 *   --fix                 Attempt to fix inconsistencies automatically
 *   --output=<path>       Path to save verification report (default: ./docs/reports/tradeoff-verification.md)
 *   --help                Show this help message
 * 
 * Example:
 *   node scripts/verify-tradeoff-docs.js --verbose
 */

const fs = require('fs')
const path = require('path')

// Default configuration
const config = {
  verbose: false,
  fix: false,
  outputFile: './docs/reports/tradeoff-verification.md',
  implementationFile: './scripts/taskmaster-enhanced.js',
  workflowDocsFile: './docs/taskmaster/tradeoff-analysis-workflow.md',
  guideDocsFile: './docs/taskmaster/tradeoff-analysis-guide.md',
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  
  for (const arg of args) {
    if (arg === '--help') {
      showHelp()
      process.exit(0)
    }
    
    if (arg === '--verbose') {
      config.verbose = true
      continue
    }
    
    if (arg === '--fix') {
      config.fix = true
      continue
    }
    
    const match = arg.match(/^--([^=]+)=(.+)$/)
    if (match) {
      const [, key, value] = match
      if (key === 'output') {
        config.outputFile = value
      }
    }
  }
}

function showHelp() {
  const helpText = fs.readFileSync(__filename, 'utf8')
    .split('\n')
    .slice(1, 17)
    .map(line => line.replace(/^\s*\* ?/, ''))
    .join('\n')
  
  console.log(helpText)
}

function log(message, level = 'info') {
  const colors = {
    info: '\x1b[34m',    // blue
    success: '\x1b[32m', // green
    warning: '\x1b[33m', // yellow
    error: '\x1b[31m',   // red
    reset: '\x1b[0m'
  }
  
  if (level === 'info' && !config.verbose) {
    return
  }
  
  console.log(`${colors[level]}[${level.toUpperCase()}]${colors.reset} ${message}`)
}

// Create directory if it doesn't exist
function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath)
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
    log(`Created directory: ${dirname}`, 'info')
  }
}

// Check if the implementation file exists
function checkImplementationFile() {
  if (!fs.existsSync(config.implementationFile)) {
    log(`Implementation file not found: ${config.implementationFile}`, 'error')
    return false
  }
  
  log(`Found implementation file: ${config.implementationFile}`, 'info')
  return true
}

// Check if the documentation files exist
function checkDocumentationFiles() {
  const workflowExists = fs.existsSync(config.workflowDocsFile)
  const guideExists = fs.existsSync(config.guideDocsFile)
  
  if (!workflowExists) {
    log(`Workflow documentation file not found: ${config.workflowDocsFile}`, 'error')
  } else {
    log(`Found workflow documentation file: ${config.workflowDocsFile}`, 'info')
  }
  
  if (!guideExists) {
    log(`Guide documentation file not found: ${config.guideDocsFile}`, 'error')
  } else {
    log(`Found guide documentation file: ${config.guideDocsFile}`, 'info')
  }
  
  return workflowExists && guideExists
}

// Extract command line options from implementation file
function extractImplementationCommands() {
  const content = fs.readFileSync(config.implementationFile, 'utf8')
  const commands = []
  
  // Simplify the regex pattern to avoid unmatched parenthesis
  const pattern1 = /argv\.includes\('(--[a-zA-Z0-9-]+(?:=(?:<[^>]+>)?)?)/g
  const pattern2 = /process\.argv\.indexOf\('(--[a-zA-Z0-9-]+(?:=(?:<[^>]+>)?)?)/g
  const pattern3 = /const\s+([a-zA-Z0-9]+)\s*=\s*process\.argv\.includes\('(--[a-zA-Z0-9-]+(?:=(?:<[^>]+>)?)?)/g
  
  // Check each pattern separately to avoid complex regex
  let match
  
  while ((match = pattern1.exec(content)) !== null) {
    if (match[1] && (match[1].includes('tradeoff') || match[1].includes('mcp'))) {
      commands.push(match[1])
    }
  }
  
  while ((match = pattern2.exec(content)) !== null) {
    if (match[1] && (match[1].includes('tradeoff') || match[1].includes('mcp'))) {
      commands.push(match[1])
    }
  }
  
  while ((match = pattern3.exec(content)) !== null) {
    if (match[2] && (match[2].includes('tradeoff') || match[2].includes('mcp'))) {
      commands.push(match[2])
    }
  }
  
  log(`Extracted ${commands.length} relevant commands from implementation file`, 'info')
  return [...new Set(commands)] // Remove duplicates
}

// Extract npm scripts related to tradeoff analysis
function extractNpmScripts() {
  const packageJsonPath = './package.json'
  if (!fs.existsSync(packageJsonPath)) {
    log(`package.json not found`, 'error')
    return []
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const scripts = packageJson.scripts || {}
  
  const tradeoffScripts = Object.entries(scripts)
    .filter(([name, command]) => name.includes('tradeoff') || (command.includes('tradeoff') && command.includes('taskmaster')))
    .map(([name, command]) => ({ name: `npm run ${name}`, command }))
  
  log(`Extracted ${tradeoffScripts.length} npm scripts related to tradeoff analysis`, 'info')
  return tradeoffScripts
}

// Check if commands are documented in workflow documentation
function checkCommandsInWorkflowDocs(commands, npmScripts) {
  const content = fs.readFileSync(config.workflowDocsFile, 'utf8')
  const results = {
    documented: [],
    undocumented: [],
    npmScriptsDocumented: [],
    npmScriptsUndocumented: []
  }
  
  // Check CLI commands
  for (const command of commands) {
    if (content.includes(command)) {
      results.documented.push(command)
      log(`Command documented in workflow: ${command}`, 'info')
    } else {
      results.undocumented.push(command)
      log(`Command NOT documented in workflow: ${command}`, 'warning')
    }
  }
  
  // Check npm scripts
  for (const script of npmScripts) {
    if (content.includes(script.name)) {
      results.npmScriptsDocumented.push(script)
      log(`npm script documented in workflow: ${script.name}`, 'info')
    } else {
      results.npmScriptsUndocumented.push(script)
      log(`npm script NOT documented in workflow: ${script.name}`, 'warning')
    }
  }
  
  return results
}

// Check if commands are documented in guide documentation
function checkCommandsInGuideDocs(commands, npmScripts) {
  const content = fs.readFileSync(config.guideDocsFile, 'utf8')
  const results = {
    documented: [],
    undocumented: [],
    npmScriptsDocumented: [],
    npmScriptsUndocumented: []
  }
  
  // Check CLI commands
  for (const command of commands) {
    if (content.includes(command)) {
      results.documented.push(command)
      log(`Command documented in guide: ${command}`, 'info')
    } else {
      results.undocumented.push(command)
      log(`Command NOT documented in guide: ${command}`, 'warning')
    }
  }
  
  // Check npm scripts
  for (const script of npmScripts) {
    if (content.includes(script.name)) {
      results.npmScriptsDocumented.push(script)
      log(`npm script documented in guide: ${script.name}`, 'info')
    } else {
      results.npmScriptsUndocumented.push(script)
      log(`npm script NOT documented in guide: ${script.name}`, 'warning')
    }
  }
  
  return results
}

// Extract configuration options from implementation file
function extractConfigOptions() {
  const content = fs.readFileSync(config.implementationFile, 'utf8')
  const options = []
  
  // Look for configuration loading or default values
  const configRegex = /(?:const\s+([a-zA-Z0-9]+)(?:\s*=\s*{[^}]*tradeoff[^}]*}|\s*\[[^\]]*tradeoff[^\]]*\]|.*tradeoffAnalysis))/g
  
  let match
  while ((match = configRegex.exec(content)) !== null) {
    const configVarName = match[1]
    
    // Find properties of this configuration object
    const configBlockRegex = new RegExp(`${configVarName}\\s*=\\s*({[\\s\\S]*?});`)
    const configBlockMatch = configBlockRegex.exec(content)
    
    if (configBlockMatch) {
      const configBlock = configBlockMatch[1]
      // Extract properties using a simplistic approach
      const propertyRegex = /([a-zA-Z0-9_]+)\s*:/g
      let propertyMatch
      while ((propertyMatch = propertyRegex.exec(configBlock)) !== null) {
        options.push(propertyMatch[1])
      }
    }
  }
  
  log(`Extracted ${options.length} configuration options from implementation file`, 'info')
  return [...new Set(options)] // Remove duplicates
}

// Check if configuration options are documented
function checkConfigOptionsInDocs(options) {
  const workflowContent = fs.readFileSync(config.workflowDocsFile, 'utf8')
  const guideContent = fs.readFileSync(config.guideDocsFile, 'utf8')
  
  const results = {
    documented: [],
    undocumented: []
  }
  
  for (const option of options) {
    if (workflowContent.includes(option) || guideContent.includes(option)) {
      results.documented.push(option)
      log(`Configuration option documented: ${option}`, 'info')
    } else {
      results.undocumented.push(option)
      log(`Configuration option NOT documented: ${option}`, 'warning')
    }
  }
  
  return results
}

// Generate a verification report in markdown format
function generateReport(commandResults, configResults) {
  const timestamp = new Date().toISOString();
  
  let reportContent = `# Tradeoff Analysis Documentation Verification Report

Generated on: ${timestamp}

## Summary

${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length + commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length + configResults.undocumented.length === 0 
  ? '✅ **All components properly documented!**' 
  : '⚠️ **Documentation inconsistencies found.**'}

| Component | Total | Documented | Undocumented |
|-----------|-------|------------|--------------|
| CLI Commands | ${commandResults.all.length} | ${commandResults.workflowDocumented.length + commandResults.guideDocumented.length} | ${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length} |
| npm Scripts | ${commandResults.npmAll.length} | ${commandResults.npmWorkflowDocumented.length + commandResults.npmGuideDocumented.length} | ${commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length} |
| Configuration Options | ${configResults.all.length} | ${configResults.documented.length} | ${configResults.undocumented.length} |

## CLI Commands

### Documented CLI Commands
${commandResults.workflowDocumented.length + commandResults.guideDocumented.length === 0 ? 'None found.' : ''}
${commandResults.workflowDocumented.map(cmd => `- \`${cmd}\` (in workflow documentation)`).join('\n')}
${commandResults.guideDocumented.filter(cmd => !commandResults.workflowDocumented.includes(cmd)).map(cmd => `- \`${cmd}\` (in guide documentation)`).join('\n')}

### Undocumented CLI Commands
${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length === 0 ? 'None found.' : ''}
${commandResults.workflowUndocumented.filter(cmd => commandResults.guideUndocumented.includes(cmd)).map(cmd => `- \`${cmd}\` (missing from both workflow and guide)`).join('\n')}
${commandResults.workflowUndocumented.filter(cmd => !commandResults.guideUndocumented.includes(cmd)).map(cmd => `- \`${cmd}\` (missing from workflow documentation)`).join('\n')}
${commandResults.guideUndocumented.filter(cmd => !commandResults.workflowUndocumented.includes(cmd)).map(cmd => `- \`${cmd}\` (missing from guide documentation)`).join('\n')}

## npm Scripts

### Documented npm Scripts
${commandResults.npmWorkflowDocumented.length + commandResults.npmGuideDocumented.length === 0 ? 'None found.' : ''}
${commandResults.npmWorkflowDocumented.map(script => `- \`${script.name}\` (in workflow documentation)`).join('\n')}
${commandResults.npmGuideDocumented.filter(script => !commandResults.npmWorkflowDocumented.some(s => s.name === script.name)).map(script => `- \`${script.name}\` (in guide documentation)`).join('\n')}

### Undocumented npm Scripts
${commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length === 0 ? 'None found.' : ''}
${commandResults.npmWorkflowUndocumented.filter(script => commandResults.npmGuideUndocumented.some(s => s.name === script.name)).map(script => `- \`${script.name}\` (missing from both workflow and guide)`).join('\n')}
${commandResults.npmWorkflowUndocumented.filter(script => !commandResults.npmGuideUndocumented.some(s => s.name === script.name)).map(script => `- \`${script.name}\` (missing from workflow documentation)`).join('\n')}
${commandResults.npmGuideUndocumented.filter(script => !commandResults.npmWorkflowUndocumented.some(s => s.name === script.name)).map(script => `- \`${script.name}\` (missing from guide documentation)`).join('\n')}

## Configuration Options

### Documented Configuration Options
${configResults.documented.length === 0 ? 'None found.' : ''}
${configResults.documented.map(option => `- \`${option}\``).join('\n')}

### Undocumented Configuration Options
${configResults.undocumented.length === 0 ? 'None found.' : ''}
${configResults.undocumented.map(option => `- \`${option}\``).join('\n')}

## Recommendations

${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length + commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length + configResults.undocumented.length === 0 
  ? '✅ No recommendations - documentation is complete and accurate!' 
  : ''}

${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length > 0 
  ? '### CLI Commands\n\nUpdate documentation to include these CLI commands:\n\n' + 
    commandResults.workflowUndocumented.filter(cmd => commandResults.guideUndocumented.includes(cmd))
      .map(cmd => `- Add \`${cmd}\` to both workflow and guide documentation`)
      .join('\n')
  : ''}

${commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length > 0 
  ? '### npm Scripts\n\nUpdate documentation to include these npm scripts:\n\n' + 
    commandResults.npmWorkflowUndocumented.filter(script => commandResults.npmGuideUndocumented.some(s => s.name === script.name))
      .map(script => `- Add \`${script.name}\` to both workflow and guide documentation`)
      .join('\n')
  : ''}

${configResults.undocumented.length > 0 
  ? '### Configuration Options\n\nUpdate documentation to include these configuration options:\n\n' + 
    configResults.undocumented.map(option => `- Add \`${option}\` to workflow or guide documentation`).join('\n')
  : ''}

## Next Steps

1. ${commandResults.workflowUndocumented.length + commandResults.guideUndocumented.length + commandResults.npmWorkflowUndocumented.length + commandResults.npmGuideUndocumented.length + configResults.undocumented.length === 0 
    ? 'Continue maintaining documentation as the codebase evolves' 
    : 'Update documentation to address the issues identified above'}
2. Run this verification script regularly as part of your documentation workflow
3. Consider adding this verification to your CI/CD pipeline
4. Update the script if new aspects of the tradeoff analysis feature are added
`;
  
  return reportContent;
}

// Save report to file
function saveReport(report) {
  try {
    ensureDirectoryExists(config.outputFile);
    fs.writeFileSync(config.outputFile, report);
    log(`Report saved to ${config.outputFile}`, 'success');
  } catch (error) {
    log(`Error saving report: ${error.message}`, 'error');
  }
}

// Main function
async function main() {
  parseArgs();
  
  log('Starting tradeoff analysis documentation verification...', 'info');
  
  // Check if required files exist
  const implementationExists = checkImplementationFile();
  const docsExist = checkDocumentationFiles();
  
  if (!implementationExists || !docsExist) {
    log('Required files not found. Aborting verification.', 'error');
    process.exit(1);
  }
  
  // Extract commands from implementation
  const commands = extractImplementationCommands();
  
  // Extract npm scripts
  const npmScripts = extractNpmScripts();
  
  // Check commands in documentation
  const workflowResults = checkCommandsInWorkflowDocs(commands, npmScripts);
  const guideResults = checkCommandsInGuideDocs(commands, npmScripts);
  
  // Extract configuration options
  const configOptions = extractConfigOptions();
  
  // Check config options in documentation
  const configResults = checkConfigOptionsInDocs(configOptions);
  
  // Combine results
  const commandResults = {
    all: commands,
    workflowDocumented: workflowResults.documented,
    workflowUndocumented: workflowResults.undocumented,
    guideDocumented: guideResults.documented,
    guideUndocumented: guideResults.undocumented,
    npmAll: npmScripts,
    npmWorkflowDocumented: workflowResults.npmScriptsDocumented,
    npmWorkflowUndocumented: workflowResults.npmScriptsUndocumented,
    npmGuideDocumented: guideResults.npmScriptsDocumented,
    npmGuideUndocumented: guideResults.npmScriptsUndocumented
  };
  
  // Generate and save report
  const reportContent = generateReport(commandResults, {
    all: configOptions,
    documented: configResults.documented,
    undocumented: configResults.undocumented
  });
  
  // Save report
  try {
    saveReport(reportContent);
  
    // Summary
    const undocumentedCount = workflowResults.undocumented.length + 
                            guideResults.undocumented.length + 
                            workflowResults.npmScriptsUndocumented.length + 
                            guideResults.npmScriptsUndocumented.length + 
                            configResults.undocumented.length;
    
    if (undocumentedCount === 0) {
      log('Verification complete. All components are properly documented!', 'success');
    } else {
      log(`Verification complete. Found ${undocumentedCount} documentation inconsistencies.`, 'warning');
    }
    
    // If fixing is enabled, suggest to run with the --fix flag
    if (undocumentedCount > 0 && !config.fix) {
      log('To automatically fix issues, run with --fix flag', 'info');
    }
    
    // Exit with appropriate code
    return undocumentedCount === 0 ? 0 : 1;
  } catch (error) {
    log(`Error during verification: ${error.message}`, 'error');
    return 1;
  }
}

// Run the script
main().then(exitCode => {
  process.exit(exitCode);
}).catch(error => {
  log(`Error: ${error.message}`, 'error');
  process.exit(1);
}); 