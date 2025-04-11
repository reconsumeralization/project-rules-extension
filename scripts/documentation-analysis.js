#!/usr/bin/env node

/**
 * Documentation Analysis Tool
 * 
 * This tool analyzes the documentation in the codebase and identifies disconnects
 * between documentation and code implementation.
 * 
 * Usage:
 *   node documentation-analysis.js [options]
 * 
 * Options:
 *   --scan-dirs=DIRS        Comma-separated list of directories to scan (default: .)
 *   --include-pattern=PATTERN File pattern to include (default: **//*.{js,ts,jsx,tsx,md})   
 *   --exclude-pattern=PATTERN File pattern to exclude (default: node_modules/**) 
 *   --output=PATH           Output file path (default: doc-analysis-report.md)
 *   --format=FORMAT         Output format: md, json, html (default: md)
 *   --verbose               Show detailed logs
 *   --quiet                 Show only errors
 *   --config=PATH           Use custom configuration file
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');

// Default configuration
const DEFAULT_CONFIG = {
  scanDirs: ['.'],
  includePattern: '**/*.{md,js,ts,jsx,tsx}',
  excludePattern: 'node_modules/**',
  outputFile: 'doc-analysis-report.md',
  outputFormat: 'md',
  verbosity: 'normal',
  docPatterns: {
    taskmaster: {
      files: ['scripts/taskmaster*.js', 'docs/taskmaster/**/*.md'],
      expectedReferences: [
        { name: 'Phase-based development', required: true },
        { name: 'MCP integration', required: true },
        { name: 'Tradeoff analysis', required: true },
        { name: 'Task breakdown', required: true }
      ]
    },
    codebase: {
      files: ['**/*.{js,ts,jsx,tsx}'],
      expectedDocumentation: [
        { pattern: /function\s+([A-Za-z0-9_]+)/, docType: 'function' },
        { pattern: /class\s+([A-Za-z0-9_]+)/, docType: 'class' }
      ]
    }
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: '.',
    output: DEFAULT_CONFIG.outputFile,
    format: DEFAULT_CONFIG.outputFormat,
    fix: false,
    verbose: false,
    quiet: false,
    config: null,
    includePattern: DEFAULT_CONFIG.includePattern,
    excludePattern: DEFAULT_CONFIG.excludePattern
  };

  args.forEach(arg => {
    if (arg.startsWith('--dir=')) {
      options.dir = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg === '--fix') {
      options.fix = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg.startsWith('--config=')) {
      options.config = arg.split('=')[1];
    } else if (arg.startsWith('--include-pattern=')) {
      options.includePattern = arg.split('=')[1];
    } else if (arg.startsWith('--exclude-pattern=')) {
      options.excludePattern = arg.split('=')[1];
    }
  });

  return options;
}

// Load configuration from file
function loadConfig(configPath) {
  try {
    if (!configPath) {
      return DEFAULT_CONFIG;
    }
    const configContent = fs.readFileSync(configPath, 'utf8');
    const userConfig = JSON.parse(configContent);
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    return DEFAULT_CONFIG;
  }
}

// Log utility function
function log(message, level = 'info') {
  if (options.quiet && level !== 'error') {
    return;
  }
  if (level === 'debug' && !options.verbose) {
    return;
  }

  switch (level) {
    case 'error':
      console.error(chalk.red(message));
      break;
    case 'warning':
      console.warn(chalk.yellow(message));
      break;
    case 'success':
      console.log(chalk.green(message));
      break;
    case 'info':
      console.log(message);
      break;
    case 'debug':
      console.log(chalk.gray(`[DEBUG] ${message}`));
      break;
  }
}

// Find files matching patterns
function findFiles(patterns, excludePattern) {
  let files = [];
  patterns.forEach(pattern => {
    const matches = glob.sync(pattern, { ignore: excludePattern });
    files = [...files, ...matches];
  });
  return [...new Set(files)]; // Remove duplicates
}

// Check for documentation references
function checkDocReferences(files, expectedReferences) {
  const results = {
    missingReferences: [],
    foundReferences: []
  };

  expectedReferences.forEach(ref => {
    let found = false;
    const refRegex = new RegExp(ref.name, 'i');

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (refRegex.test(content)) {
        found = true;
        results.foundReferences.push({
          reference: ref.name,
          file,
          required: ref.required
        });
        break;
      }
    }

    if (!found && ref.required) {
      results.missingReferences.push({
        reference: ref.name,
        required: ref.required
      });
    }
  });

  return results;
}

// Check for code documentation
function checkCodeDocumentation(files, expectedDocs) {
  const results = {
    missingDocs: [],
    documentedItems: []
  };

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    expectedDocs.forEach(docItem => {
      const matches = content.match(new RegExp(docItem.pattern, 'g'));
      if (matches) {
        matches.forEach(match => {
          const nameMatch = match.match(docItem.pattern);
          if (nameMatch && nameMatch[1]) {
            const itemName = nameMatch[1];
            const docPattern = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/[\\s]*${itemName}`, 'm');
            
            if (!docPattern.test(content)) {
              results.missingDocs.push({
                item: itemName,
                type: docItem.docType,
                file
              });
            } else {
              results.documentedItems.push({
                item: itemName,
                type: docItem.docType,
                file
              });
            }
          }
        });
      }
    });
  });

  return results;
}

// Analyze documentation for the specified category
function analyzeDocumentationCategory(category, config) {
  const categoryConfig = config.docPatterns[category];
  const files = findFiles(categoryConfig.files, config.excludePattern);
  
  log(`Analyzing ${files.length} files for category: ${category}`, 'debug');
  
  let results = {
    missingReferences: [],
    foundReferences: [],
    missingDocs: [],
    documentedItems: []
  };
  
  if (categoryConfig.expectedReferences) {
    const refResults = checkDocReferences(files, categoryConfig.expectedReferences);
    results.missingReferences = refResults.missingReferences;
    results.foundReferences = refResults.foundReferences;
    
    // Use utility function to determine log level
    const missingRefsCount = refResults.missingReferences.length;
    log(`Found ${refResults.foundReferences.length} references, missing ${missingRefsCount}`, 
        determineLogLevel(missingRefsCount, 0));
  }
  
  if (categoryConfig.expectedDocumentation) {
    const docResults = checkCodeDocumentation(files, categoryConfig.expectedDocumentation);
    results.missingDocs = docResults.missingDocs;
    results.documentedItems = docResults.documentedItems;
    
    // Use utility function to determine log level
    const missingDocsCount = docResults.missingDocs.length;
    log(`Found ${docResults.documentedItems.length} documented items, missing ${missingDocsCount}`, 
        determineLogLevel(missingDocsCount, 0, 0));
  }
  
  return results;
}

// Check for documentation disconnects
function analyzeDocumentation(config) {
  const results = {
    docReferences: {},
    codeDocumentation: {},
    summary: {
      totalMissingReferences: 0,
      totalFoundReferences: 0,
      totalMissingDocs: 0,
      totalDocumentedItems: 0
    }
  };

  try {
    // Check documentation references
    for (const [category, categoryConfig] of Object.entries(config.docPatterns)) {
      const categoryResults = analyzeDocumentationCategory(category, config);
      
      // Store the reference and documentation results
      if (categoryConfig.expectedReferences) {
        results.docReferences[category] = {
          missingReferences: categoryResults.missingReferences,
          foundReferences: categoryResults.foundReferences
        };
      }
      
      if (categoryConfig.expectedDocumentation) {
        results.codeDocumentation[category] = {
          missingDocs: categoryResults.missingDocs,
          documentedItems: categoryResults.documentedItems
        };
      }
      
      // Update summary counts
      results.summary.totalMissingReferences += categoryResults.missingReferences.length;
      results.summary.totalFoundReferences += categoryResults.foundReferences.length;
      results.summary.totalMissingDocs += categoryResults.missingDocs.length;
      results.summary.totalDocumentedItems += categoryResults.documentedItems.length;
    }

    return results;
  } catch (error) {
    log(`Error analyzing documentation: ${error.message}`, 'error');
    return results;
  }
}

// Generate markdown report
function generateMarkdownReport(results) {
  let report = '# Documentation Analysis Report\n\n';
  
  report += `## Summary\n\n`;
  report += `- Missing Documentation References: ${results.summary.totalMissingReferences}\n`;
  report += `- Missing Code Documentation: ${results.summary.totalMissingDocs}\n`;
  report += `- Properly Documented Items: ${results.summary.totalDocumentedItems}\n`;
  report += `- Found Documentation References: ${results.summary.totalFoundReferences}\n\n`;
  
  if (results.summary.totalMissingReferences > 0) {
    report += `## Missing Documentation References\n\n`;
    
    // Missing references
    for (const [category, refResults] of Object.entries(results.docReferences)) {
      if (refResults && refResults.missingReferences.length > 0) {
        report += `### Missing References in ${category}\n\n`;
        refResults.missingReferences.forEach(ref => {
          report += `- ${ref.reference} ${ref.required ? '(Required)' : '(Optional)'}\n`;
        });
        report += '\n';
      }
    }
  }
  
  if (results.summary.totalMissingDocs > 0) {
    report += `## Missing Code Documentation\n\n`;
    
    // Missing code documentation
    for (const [category, docResults] of Object.entries(results.codeDocumentation)) {
      if (docResults && docResults.missingDocs.length > 0) {
        report += `### Missing Code Documentation in ${category}\n\n`;
        report += `| Item | Type | File |\n`;
        report += `| ---- | ---- | ---- |\n`;
        docResults.missingDocs.forEach(doc => {
          report += `| ${doc.item} | ${doc.type} | ${doc.file} |\n`;
        });
        report += '\n';
      }
    }
  }
  
  report += `## Documented Items\n\n`;
  for (const [category, docResults] of Object.entries(results.codeDocumentation)) {
    if (docResults && docResults.documentedItems.length > 0) {
      report += `### ${category}\n\n`;
      report += `| Item | Type | File |\n`;
      report += `| ---- | ---- | ---- |\n`;
      docResults.documentedItems.forEach(doc => {
        report += `| ${doc.item} | ${doc.type} | ${doc.file} |\n`;
      });
      report += '\n';
    }
  }
  
  return report;
}

// Generate HTML report
function generateHtmlReport(results) {
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Documentation Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .error { color: #d9534f; }
    .warning { color: #f0ad4e; }
    .success { color: #5cb85c; }
  </style>
</head>
<body>
  <h1>Documentation Analysis Report</h1>
  
  <h2>Summary</h2>
  <ul>
    <li class="${results.summary.totalMissingReferences > 0 ? 'error' : 'success'}">
      Missing Documentation References: ${results.summary.totalMissingReferences}
    </li>
    <li class="${results.summary.totalMissingDocs > 0 ? 'warning' : 'success'}">
      Missing Code Documentation: ${results.summary.totalMissingDocs}
    </li>
    <li class="success">Properly Documented Items: ${results.summary.totalDocumentedItems}</li>
    <li class="success">Found Documentation References: ${results.summary.totalFoundReferences}</li>
  </ul>`;
  
  let hasMissingRefs = false;
  let hasMissingDocs = false;
  
  // Missing references
  if (results.summary.totalMissingReferences > 0) {
    html += `<h2>Missing Documentation References</h2>`;
    
    for (const [category, refResults] of Object.entries(results.docReferences)) {
      if (refResults && refResults.missingReferences.length > 0) {
        hasMissingRefs = true;
        html += `<h3>${category}</h3>
        <ul>`;
        refResults.missingReferences.forEach(ref => {
          html += `<li>${ref.reference} ${ref.required ? '(Required)' : '(Optional)'}</li>`;
        });
        html += `</ul>`;
      }
    }
    
    if (!hasMissingRefs) {
      html += `<p>No missing references found.</p>`;
    }
  }
  
  // Missing code documentation
  if (results.summary.totalMissingDocs > 0) {
    html += `<h2>Missing Code Documentation</h2>`;
    
    for (const [category, docResults] of Object.entries(results.codeDocumentation)) {
      if (docResults && docResults.missingDocs.length > 0) {
        hasMissingDocs = true;
        html += `<h3>${category}</h3>
        <table>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>File</th>
          </tr>`;
        docResults.missingDocs.forEach(doc => {
          html += `<tr>
            <td>${doc.name}</td>
            <td>${doc.type}</td>
            <td>${doc.file}</td>
          </tr>`;
        });
        html += `</table>`;
      }
    }
    
    if (!hasMissingDocs) {
      html += `<p>No missing code documentation found.</p>`;
    }
  }
  
  html += `</body></html>`;
  return html;
}

// Generate report in JSON format
function generateJsonReport(results) {
  return JSON.stringify(results, null, 2);
}

// Generate report based on format
function generateReport(results, format) {
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return generateMarkdownReport(results);
    case 'json':
      return generateJsonReport(results);
    case 'html':
      return generateHtmlReport(results);
    default:
      log(`Unknown format: ${format}, falling back to markdown`, 'warning');
      return generateMarkdownReport(results);
  }
}

// Save report to file
function saveReport(report, outputFile) {
  try {
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFile, report);
    log(`Report saved to ${outputFile}`, 'success');
  } catch (error) {
    log(`Error saving report: ${error.message}`, 'error');
  }
}

// Utility function to determine log level based on count
function determineLogLevel(count, errorThreshold = 0, warningThreshold = 0) {
  if (count > errorThreshold) {
    return 'error';
  }
  if (count > warningThreshold) {
    return 'warning';
  }
  return 'success';
}

// Main function
function main() {
  // Parse command line arguments
  const options = parseArgs();
  
  // Load configuration
  const config = loadConfig(options.config);
  config.includePattern = options.includePattern;
  config.excludePattern = options.excludePattern;
  
  log('Starting documentation analysis...', 'info');
  
  // Analyze documentation
  const results = analyzeDocumentation(config);
  
  // Generate report
  const report = generateReport(results, options.format);
  
  // Save report
  saveReport(report, options.output);
  
  // Output summary
  log('\nAnalysis Summary:', 'info');
  
  // Use utility function to determine log levels
  log(`Missing Documentation References: ${results.summary.totalMissingReferences}`, 
      determineLogLevel(results.summary.totalMissingReferences, 0));
  
  log(`Missing Code Documentation: ${results.summary.totalMissingDocs}`, 
      determineLogLevel(results.summary.totalMissingDocs, 0, 0));
  
  log(`Properly Documented Items: ${results.summary.totalDocumentedItems}`, 'success');
  log(`Found Documentation References: ${results.summary.totalFoundReferences}`, 'success');
  
  // Exit with appropriate code
  if (results.summary.totalMissingReferences > 0) {
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
main();