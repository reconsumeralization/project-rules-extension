#!/usr/bin/env node

/**
 * Terminology Checker
 * 
 * This script analyzes code and documentation to identify inconsistent terminology.
 * It helps maintain consistent naming across the codebase and documentation.
 * 
 * Usage:
 *   node terminology-checker.js [options]
 * 
 * Options:
 *   --code-dir=<path>    Directory to scan for code files (default: ./scripts)
 *   --docs-dir=<path>    Directory to scan for documentation (default: ./docs)
 *   --terms=<path>       Path to terminology JSON file (default: ./docs/terminology.json)
 *   --output=<path>      Output file path (default: ./docs/terminology-report.md)
 *   --format=<format>    Output format: md, json, html (default: md)
 *   --verbose            Show detailed output during scanning
 *   --help               Show this help message
 *   --fix                Automatically fix terminology issues in files
 * 
 * Example:
 *   node terminology-checker.js --verbose --format=html
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { execSync } = require('child_process');

// Default configuration
const config = {
  codeDir: './scripts',
  docsDir: './docs',
  outputFile: './docs/terminology-report.md',
  termsFile: './docs/terminology.json',
  format: 'md',
  verbose: false,
  fix: false
};

// Default terminology mapping (preferred term: [alternatives])
const defaultTerminology = {
  "taskmaster": ["task master", "task-master"],
  "subtask": ["sub-task", "sub task"],
  "tradeoff analysis": ["trade-off analysis", "tradeoff-analysis", "trade off analysis"],
  "phase": ["stage", "step"],
  "planning phase": ["planning stage", "planning step"],
  "design phase": ["design stage", "design step"],
  "implementation phase": ["implementation stage", "implementation step", "coding phase", "coding stage"],
  "testing phase": ["testing stage", "testing step", "test phase"],
  "review phase": ["review stage", "review step"],
  "deployment phase": ["deployment stage", "deployment step", "release phase"],
  "mcp": ["model context protocol", "model-context-protocol"],
  "enhanced taskmaster": ["advanced taskmaster", "taskmaster enhanced"],
  "workflow": ["work flow", "work-flow"],
  "autonomous": ["automated", "automatic"],
  "autonomous mode": ["automated mode", "automatic mode"]
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  args.forEach(arg => {
    if (arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (arg === '--verbose') {
      config.verbose = true;
    } else if (arg === '--fix') {
      config.fix = true;
    } else if (arg.startsWith('--code-dir=')) {
      config.codeDir = arg.split('=')[1];
    } else if (arg.startsWith('--docs-dir=')) {
      config.docsDir = arg.split('=')[1];
    } else if (arg.startsWith('--terms=')) {
      config.termsFile = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      config.outputFile = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      const format = arg.split('=')[1].toLowerCase();
      if (['md', 'json', 'html'].includes(format)) {
        config.format = format;
      } else {
        console.error(`Invalid format: ${format}. Using default: md`);
      }
    }
  });
  
  if (config.verbose) {
    console.log('Configuration:', config);
  }
}

// Show help message
function showHelp() {
  console.log(`
Terminology Checker

Usage:
  node terminology-checker.js [options]

Options:
  --code-dir=<path>    Directory to scan for code files (default: ./scripts)
  --docs-dir=<path>    Directory to scan for documentation (default: ./docs)
  --terms=<path>       Path to terminology JSON file (default: ./docs/terminology.json)
  --output=<path>      Output file path (default: ./docs/terminology-report.md)
  --format=<format>    Output format: md, json, html (default: md)
  --verbose            Show detailed output during scanning
  --help               Show this help message
  --fix                Automatically fix terminology issues in files

Example:
  node terminology-checker.js --verbose --format=html
  `);
}

// Load terminology from file or create default
function loadTerminology() {
  if (fs.existsSync(config.termsFile)) {
    try {
      const termsData = fs.readFileSync(config.termsFile, 'utf8');
      return JSON.parse(termsData);
    } catch (err) {
      console.error(`Error loading terminology file: ${err.message}`);
      console.log('Using default terminology');
      return defaultTerminology;
    }
  } else {
    // Create default terminology file
    const dir = path.dirname(config.termsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.termsFile, JSON.stringify(defaultTerminology, null, 2), 'utf8');
    console.log(`Created default terminology file: ${config.termsFile}`);
    return defaultTerminology;
  }
}

// Find files in a directory with specified extensions
function findFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.md', '.mdx', '.html', '.css', '.scss']) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return [];
  }
  
  const files = [];
  
  function traverseDir(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = fs.statSync(itemPath);
      
      // Skip node_modules, .git, and other directories to exclude
      if (stats.isDirectory()) {
        if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
          traverseDir(itemPath);
        }
        continue;
      }
      
      // Skip terminology reports and configuration files
      if (itemPath.includes('terminology-report') || 
          itemPath.includes('terminology.json') ||
          item === 'terminology-checker.js') {
        continue;
      }
      
      // Only include files with specified extensions
      const ext = path.extname(itemPath).toLowerCase();
      if (extensions.includes(ext)) {
        files.push(itemPath);
      }
    }
  }
  
  traverseDir(dir);
  return files;
}

// Check a file for terminology issues
function checkFile(filePath, terminology) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  const lines = content.split('\n');
  
  for (const [preferred, alternatives] of Object.entries(terminology)) {
    for (const alternative of alternatives) {
      // Use regex to find all instances, case insensitive
      const regex = new RegExp(alternative, 'gi');
      let match;
      
      // Check the entire content to get accurate positions
      while ((match = regex.exec(content)) !== null) {
        // Calculate line number by counting newlines before the match position
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;
        
        // Find the specific line that contains the match
        const lineContent = lines[lineNumber - 1];
        
        issues.push({
          file: filePath,
          line: lineNumber,
          position: match.index,
          found: match[0],
          preferred: preferred,
          context: lineContent.trim()
        });
      }
    }
  }
  
  return issues;
}

// Fix terminology issues in a file
function fixFile(filePath, issues) {
  if (!issues || issues.length === 0) {
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Sort issues by position in descending order to avoid offset issues when replacing
  const sortedIssues = [...issues].sort((a, b) => b.position - a.position);
  
  for (const issue of sortedIssues) {
    const beforeIssue = content.substring(0, issue.position);
    const afterIssue = content.substring(issue.position + issue.found.length);
    content = beforeIssue + issue.preferred + afterIssue;
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Fixed ${issues.length} terminology issues in ${filePath}`);
  
  // Verify the fix
  const remainingIssues = checkFile(filePath, loadTerminology());
  
  // Filter remaining issues to only those with the same preferred term
  const relevantRemainingIssues = remainingIssues.filter(remaining => 
    issues.some(original => original.preferred === remaining.preferred && 
                original.found.toLowerCase() === remaining.found.toLowerCase())
  );
  
  if (relevantRemainingIssues.length > 0) {
    console.log(`⚠️ Some issues in ${filePath} could not be fixed automatically. Manual review required.`);
    return false;
  }
  
  return true;
}

// Generate markdown report
function generateMarkdownReport(issues, terminology) {
  const sections = [];
  const totalFiles = [...new Set(issues.map(issue => issue.file))].length;
  const totalIssues = issues.length;
  
  // Generate summary
  sections.push(`# Terminology Consistency Report\n`);
  sections.push(`*Generated on ${new Date().toLocaleString()}*\n`);
  sections.push(`## Summary\n`);
  sections.push(`- Total issues found: **${totalIssues}**`);
  sections.push(`- Files with issues: **${totalFiles}**`);
  sections.push(`- Terminology entries checked: **${Object.keys(terminology).length}**\n`);
  
  // Common inconsistencies
  sections.push(`## Common Inconsistencies\n`);
  const termCounts = {};
  issues.forEach(issue => {
    const key = `${issue.alternative} → ${issue.preferred}`;
    termCounts[key] = (termCounts[key] || 0) + 1;
  });
  
  const sortedTerms = Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (sortedTerms.length > 0) {
    sections.push(`| Inconsistency | Preferred Term | Count |`);
    sections.push(`|--------------|----------------|-------|`);
    sortedTerms.forEach(([term, count]) => {
      const [alt, preferred] = term.split(' → ');
      sections.push(`| \`${alt}\` | \`${preferred}\` | ${count} |`);
    });
    sections.push('');
  } else {
    sections.push(`*No inconsistencies found*\n`);
  }
  
  // Issues by file
  sections.push(`## Issues by File\n`);
  const fileGroups = {};
  issues.forEach(issue => {
    if (!fileGroups[issue.file]) {
      fileGroups[issue.file] = [];
    }
    fileGroups[issue.file].push(issue);
  });
  
  Object.entries(fileGroups).forEach(([file, fileIssues]) => {
    const relativeFile = file.replace(/\\/g, '/');
    sections.push(`### ${relativeFile} (${fileIssues.length} issues)\n`);
    sections.push(`| Line | Inconsistency | Preferred | Context |`);
    sections.push(`|------|--------------|-----------|---------|`);
    
    fileIssues.forEach(issue => {
      // Escape pipe characters in context to avoid breaking markdown table
      const context = issue.context.replace(/\|/g, '\\|');
      // Truncate context if too long
      const truncatedContext = context.length > 60 
        ? context.substring(0, 57) + '...' 
        : context;
      
      sections.push(`| ${issue.line} | \`${issue.alternative}\` | \`${issue.preferred}\` | ${truncatedContext} |`);
    });
    sections.push('');
  });
  
  // Preferred terminology reference
  sections.push(`## Preferred Terminology Reference\n`);
  sections.push(`| Preferred Term | Alternatives |`);
  sections.push(`|---------------|-------------|`);
  
  Object.entries(terminology).sort().forEach(([preferred, alternatives]) => {
    sections.push(`| \`${preferred}\` | ${alternatives.map(a => `\`${a}\``).join(', ')} |`);
  });
  sections.push('');
  
  // Recommendations
  sections.push(`## Recommendations\n`);
  sections.push(`1. Update code and documentation to use the preferred terms consistently.`);
  sections.push(`2. Consider adding new terminology entries to \`${config.termsFile}\`.`);
  sections.push(`3. Run this checker periodically to maintain terminology consistency.`);
  sections.push(`4. Review the terminology list for completeness and accuracy.`);
  
  return sections.join('\n');
}

// Generate JSON report
function generateJsonReport(issues, terminology) {
  const totalFiles = [...new Set(issues.map(issue => issue.file))].length;
  const totalIssues = issues.length;
  
  // Count by term
  const termCounts = {};
  issues.forEach(issue => {
    const key = `${issue.alternative} → ${issue.preferred}`;
    termCounts[key] = (termCounts[key] || 0) + 1;
  });
  
  // Group by file
  const fileGroups = {};
  issues.forEach(issue => {
    if (!fileGroups[issue.file]) {
      fileGroups[issue.file] = [];
    }
    fileGroups[issue.file].push(issue);
  });
  
  const report = {
    summary: {
      totalIssues,
      totalFiles,
      terminologyEntriesChecked: Object.keys(terminology).length,
      generatedAt: new Date().toISOString()
    },
    commonInconsistencies: termCounts,
    issuesByFile: fileGroups,
    preferredTerminology: terminology
  };
  
  return JSON.stringify(report, null, 2);
}

// Generate HTML report
function generateHtmlReport(issues, terminology) {
  const totalFiles = [...new Set(issues.map(issue => issue.file))].length;
  const totalIssues = issues.length;
  
  // Common inconsistencies
  const termCounts = {};
  issues.forEach(issue => {
    const key = `${issue.alternative} → ${issue.preferred}`;
    termCounts[key] = (termCounts[key] || 0) + 1;
  });
  
  const sortedTerms = Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Group by file
  const fileGroups = {};
  issues.forEach(issue => {
    if (!fileGroups[issue.file]) {
      fileGroups[issue.file] = [];
    }
    fileGroups[issue.file].push(issue);
  });
  
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminology Consistency Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; color: #333; }
    h1, h2, h3 { margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:hover { background-color: #f5f5f5; }
    code { background-color: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
    .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 30px; }
    .summary strong { color: #d33; }
    .file-group { margin-bottom: 30px; padding: 10px; border: 1px solid #eee; border-radius: 5px; }
    .file-header { display: flex; justify-content: space-between; background: #f5f5f5; padding: 8px; margin: -10px -10px 10px; border-radius: 5px 5px 0 0; }
    .recommendations { background-color: #f0f7ff; padding: 15px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Terminology Consistency Report</h1>
  <p><em>Generated on ${new Date().toLocaleString()}</em></p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total issues found: <strong>${totalIssues}</strong></p>
    <p>Files with issues: <strong>${totalFiles}</strong></p>
    <p>Terminology entries checked: <strong>${Object.keys(terminology).length}</strong></p>
  </div>
  
  <h2>Common Inconsistencies</h2>
  ${sortedTerms.length > 0 ? `
  <table>
    <tr>
      <th>Inconsistency</th>
      <th>Preferred Term</th>
      <th>Count</th>
    </tr>
    ${sortedTerms.map(([term, count]) => {
      const [alt, preferred] = term.split(' → ');
      return `
    <tr>
      <td><code>${alt}</code></td>
      <td><code>${preferred}</code></td>
      <td>${count}</td>
    </tr>`;
    }).join('')}
  </table>
  ` : '<p><em>No inconsistencies found</em></p>'}
  
  <h2>Issues by File</h2>
  ${Object.entries(fileGroups).map(([file, fileIssues]) => {
    const relativeFile = file.replace(/\\/g, '/');
    return `
  <div class="file-group">
    <div class="file-header">
      <h3>${relativeFile}</h3>
      <span>${fileIssues.length} issues</span>
    </div>
    <table>
      <tr>
        <th>Line</th>
        <th>Inconsistency</th>
        <th>Preferred</th>
        <th>Context</th>
      </tr>
      ${fileIssues.map(issue => {
        // Escape HTML characters
        const context = issue.context
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const truncatedContext = context.length > 60 
          ? context.substring(0, 57) + '...' 
          : context;
        
        return `
      <tr>
        <td>${issue.line}</td>
        <td><code>${issue.alternative}</code></td>
        <td><code>${issue.preferred}</code></td>
        <td>${truncatedContext}</td>
      </tr>`;
      }).join('')}
    </table>
  </div>`;
  }).join('')}
  
  <h2>Preferred Terminology Reference</h2>
  <table>
    <tr>
      <th>Preferred Term</th>
      <th>Alternatives</th>
    </tr>
    ${Object.entries(terminology).sort().map(([preferred, alternatives]) => `
    <tr>
      <td><code>${preferred}</code></td>
      <td>${alternatives.map(a => `<code>${a}</code>`).join(', ')}</td>
    </tr>`).join('')}
  </table>
  
  <div class="recommendations">
    <h2>Recommendations</h2>
    <ol>
      <li>Update code and documentation to use the preferred terms consistently.</li>
      <li>Consider adding new terminology entries to <code>${config.termsFile}</code>.</li>
      <li>Run this checker periodically to maintain terminology consistency.</li>
      <li>Review the terminology list for completeness and accuracy.</li>
    </ol>
  </div>
</body>
</html>
  `;
  
  return html;
}

// Generate report based on selected format
function generateReport(issues, terminology) {
  switch (config.format) {
    case 'json':
      return generateJsonReport(issues, terminology);
    case 'html':
      return generateHtmlReport(issues, terminology);
    case 'md':
    default:
      return generateMarkdownReport(issues, terminology);
  }
}

// Save report to file
function saveReport(report) {
  const dir = path.dirname(config.outputFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(config.outputFile, report, 'utf8');
  console.log(`Report saved to: ${config.outputFile}`);
}

// Main function
async function main() {
  console.log('Terminology Checker Starting...');
  parseArgs();
  
  // Load terminology
  const terminology = loadTerminology();
  console.log(`Loaded ${Object.keys(terminology).length} terminology entries`);
  
  // Find files
  const codeFiles = findFiles(config.codeDir, ['.js', '.jsx', '.ts', '.tsx', '.vue', '.css', '.scss', '.html']);
  const docFiles = findFiles(config.docsDir, ['.md', '.mdx', '.txt', '.doc', '.docx']);
  const allFiles = [...codeFiles, ...docFiles];
  console.log(`Found ${codeFiles.length} code files and ${docFiles.length} documentation files`);
  
  // Check files
  console.log('Scanning files for terminology issues...');
  let allIssues = [];
  const fileIssues = {};
  allFiles.forEach(file => {
    const issues = checkFile(file, terminology);
    if (issues.length > 0) {
      allIssues = [...allIssues, ...issues];
      fileIssues[file] = issues;
    }
  });
  
  // Fix issues if --fix flag is set
  let fixedCount = 0;
  let failedCount = 0;
  
  if (config.fix) {
    console.log('\n📝 Fixing terminology issues...');
    
    // Group issues by file
    const fileIssues = {};
    allIssues.forEach(issue => {
      if (!fileIssues[issue.file]) {
        fileIssues[issue.file] = [];
      }
      fileIssues[issue.file].push(issue);
    });
    
    // Fix each file
    for (const [file, issues] of Object.entries(fileIssues)) {
      const success = fixFile(file, issues);
      if (success) {
        fixedCount += issues.length;
      } else {
        failedCount += issues.length;
      }
    }
    
    console.log(`\n✅ Fixed ${fixedCount} terminology issues`);
    if (failedCount > 0) {
      console.log(`❌ Failed to fix ${failedCount} issues. Manual review required.`);
    }
  }
  
  // Generate report
  console.log(`Found ${allIssues.length} terminology issues in ${allFiles.length} files`);
  const report = generateReport(allIssues, terminology);
  saveReport(report);
  
  // Print summary
  console.log(`\n📊 Terminology Check Summary:`);
  console.log(`   - Total Issues: ${allIssues.length}`);
  console.log(`   - Fixed Issues: ${fixedCount}`);
  console.log(`   - Failed Fixes: ${failedCount}`);
  console.log(`\n📄 Report saved to: ${config.outputFile}`);
}

// Run the script
main(); 