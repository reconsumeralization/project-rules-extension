#!/usr/bin/env node

/**
 * Test Coverage Analyzer
 * 
 * Analyzes test coverage reports and provides insights on code coverage.
 * 
 * Usage:
 *   node test-coverage-analyzer.js [options]
 * 
 * Options:
 *   --coverage-dir=<dir>       Directory containing coverage reports (default: ./coverage)
 *   --threshold=<percentage>   Minimum coverage threshold (default: 80)
 *   --format=<format>          Output format: text, json, html (default: text)
 *   --output=<file>            Output file (default: stdout)
 *   --ignore=<patterns>        Comma-separated glob patterns to ignore
 *   --verbose                  Display detailed information
 *   --help                     Display this help
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  coverageDir: './coverage',
  threshold: 80,
  format: 'text',
  output: null,
  ignore: [],
  verbose: false
};

// Parse arguments
args.forEach(arg => {
  if (arg === '--help') {
    showHelp();
    process.exit(0);
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg.startsWith('--coverage-dir=')) {
    options.coverageDir = arg.split('=')[1];
  } else if (arg.startsWith('--threshold=')) {
    options.threshold = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--format=')) {
    options.format = arg.split('=')[1];
  } else if (arg.startsWith('--output=')) {
    options.output = arg.split('=')[1];
  } else if (arg.startsWith('--ignore=')) {
    options.ignore = arg.split('=')[1].split(',');
  }
});

function showHelp() {
  const helpText = fs.readFileSync(__filename, 'utf8')
    .split('\n')
    .filter(line => line.startsWith(' *'))
    .map(line => line.substring(3))
    .join('\n');
  
  console.log(helpText);
}

// Main function
async function main() {
  try {
    console.log(`Analyzing test coverage in ${options.coverageDir}...`);

    // Check if coverage directory exists
    if (!fs.existsSync(options.coverageDir)) {
      console.error(`Error: Coverage directory not found: ${options.coverageDir}`);
      console.log('Run tests with coverage first:');
      console.log('  npm test -- --coverage');
      process.exit(1);
    }

    // Look for coverage-summary.json
    const summaryPath = path.join(options.coverageDir, 'coverage-summary.json');
    let coverageData;

    if (fs.existsSync(summaryPath)) {
      coverageData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } else {
      // Try to find alternative coverage files
      const lcovPath = path.join(options.coverageDir, 'lcov.info');
      if (fs.existsSync(lcovPath)) {
        console.log('Found lcov.info, converting to summary...');
        // In a real implementation, you'd use a library like lcov-parse to convert lcov to summary
        coverageData = extractDataFromLcov(lcovPath);
      } else {
        console.error('No coverage reports found. Run tests with coverage first.');
        process.exit(1);
      }
    }

    // Analyze coverage
    const analysis = analyzeCoverage(coverageData, options);

    // Generate report
    const report = generateReport(analysis, options);

    // Output report
    if (options.output) {
      fs.writeFileSync(options.output, report);
      console.log(`Report written to ${options.output}`);
    } else {
      console.log(report);
    }

    // Exit with error if below threshold
    if (analysis.overall < options.threshold) {
      console.error(`Coverage (${analysis.overall.toFixed(2)}%) is below threshold (${options.threshold}%)`);
      process.exit(1);
    }

  } catch (error) {
    console.error('Error analyzing coverage:', error);
    process.exit(1);
  }
}

// Placeholder function to extract data from lcov
function extractDataFromLcov(lcovPath) {
  // In a real implementation, you'd use a library like lcov-parse
  // For now, just return a mock object
  return {
    total: {
      lines: { total: 1000, covered: 750, pct: 75 },
      statements: { total: 1200, covered: 900, pct: 75 },
      functions: { total: 200, covered: 160, pct: 80 },
      branches: { total: 400, covered: 300, pct: 75 }
    },
    'src/index.js': {
      lines: { total: 100, covered: 80, pct: 80 },
      statements: { total: 120, covered: 96, pct: 80 },
      functions: { total: 20, covered: 18, pct: 90 },
      branches: { total: 40, covered: 32, pct: 80 }
    }
    // More files would be listed here
  };
}

// Analyze coverage data
function analyzeCoverage(coverageData, options) {
  const fileResults = [];
  let totalLines = 0;
  let coveredLines = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;
  let totalBranches = 0;
  let coveredBranches = 0;

  // Process each file
  for (const filepath in coverageData) {
    if (filepath === 'total') {
      continue;
    }
    
    // Check if file should be ignored
    if (options.ignore.some(pattern => minimatch(filepath, pattern))) {
      if (options.verbose) {
        console.log(`Ignoring file: ${filepath}`);
      }
      continue;
    }

    const fileData = coverageData[filepath];
    
    // Accumulate totals
    totalLines += fileData.lines.total;
    coveredLines += fileData.lines.covered;
    totalFunctions += fileData.functions.total;
    coveredFunctions += fileData.functions.covered;
    totalBranches += fileData.branches.total;
    coveredBranches += fileData.branches.covered;

    // Store file results
    fileResults.push({
      file: filepath,
      lines: fileData.lines.pct,
      functions: fileData.functions.pct,
      branches: fileData.branches.pct,
      overall: (fileData.lines.pct + fileData.functions.pct + fileData.branches.pct) / 3
    });
  }

  // Calculate overall percentages
  const lineCoverage = totalLines ? (coveredLines / totalLines) * 100 : 0;
  const functionCoverage = totalFunctions ? (coveredFunctions / totalFunctions) * 100 : 0;
  const branchCoverage = totalBranches ? (coveredBranches / totalBranches) * 100 : 0;
  const overallCoverage = (lineCoverage + functionCoverage + branchCoverage) / 3;

  // Sort files by coverage
  fileResults.sort((a, b) => a.overall - b.overall);

  return {
    files: fileResults,
    lines: lineCoverage,
    functions: functionCoverage,
    branches: branchCoverage,
    overall: overallCoverage,
    passesThreshold: overallCoverage >= options.threshold
  };
}

// Generate a report based on the format
function generateReport(analysis, options) {
  switch (options.format) {
    case 'json':
      return JSON.stringify(analysis, null, 2);
    
    case 'html':
      return generateHtmlReport(analysis, options);
    
    case 'text':
    default:
      return generateTextReport(analysis, options);
  }
}

// Generate a text report
function generateTextReport(analysis, options) {
  let report = '\n=== Test Coverage Analysis ===\n\n';
  
  // Overall stats
  report += `Overall coverage: ${analysis.overall.toFixed(2)}%\n`;
  report += `Line coverage: ${analysis.lines.toFixed(2)}%\n`;
  report += `Function coverage: ${analysis.functions.toFixed(2)}%\n`;
  report += `Branch coverage: ${analysis.branches.toFixed(2)}%\n\n`;
  
  // Threshold check
  if (analysis.passesThreshold) {
    report += `✅ Coverage is above threshold (${options.threshold}%)\n\n`;
  } else {
    report += `❌ Coverage is below threshold (${options.threshold}%)\n\n`;
  }
  
  // File details
  if (options.verbose) {
    report += 'File Coverage:\n';
    report += '-------------\n';
    
    analysis.files.forEach(file => {
      const icon = file.overall < options.threshold ? '❌' : '✅';
      report += `${icon} ${file.file}: ${file.overall.toFixed(2)}% (Lines: ${file.lines.toFixed(2)}%, Functions: ${file.functions.toFixed(2)}%, Branches: ${file.branches.toFixed(2)}%)\n`;
    });
    
    // Low coverage files
    report += '\nFiles with lowest coverage:\n';
    const lowCoverageFiles = [...analysis.files].sort((a, b) => a.overall - b.overall).slice(0, 5);
    lowCoverageFiles.forEach(file => {
      report += `- ${file.file}: ${file.overall.toFixed(2)}%\n`;
    });
  }
  
  return report;
}

// Generate an HTML report
function generateHtmlReport(analysis, options) {
  // Placeholder for HTML report generation
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Coverage Analysis</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { margin-bottom: 20px; }
    .summary { margin-bottom: 20px; }
    .files { border-collapse: collapse; width: 100%; }
    .files th, .files td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .files tr:nth-child(even) { background-color: #f2f2f2; }
    .files th { padding-top: 12px; padding-bottom: 12px; background-color: #4CAF50; color: white; }
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Test Coverage Analysis</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Overall coverage: <strong>${analysis.overall.toFixed(2)}%</strong></p>
    <p>Line coverage: ${analysis.lines.toFixed(2)}%</p>
    <p>Function coverage: ${analysis.functions.toFixed(2)}%</p>
    <p>Branch coverage: ${analysis.branches.toFixed(2)}%</p>
    <p class="${analysis.passesThreshold ? 'pass' : 'fail'}">
      ${analysis.passesThreshold ? '✅' : '❌'} Threshold: ${options.threshold}%
    </p>
  </div>
  
  <div class="files-section">
    <h2>File Coverage</h2>
    <table class="files">
      <tr>
        <th>File</th>
        <th>Overall</th>
        <th>Lines</th>
        <th>Functions</th>
        <th>Branches</th>
      </tr>`;
  
  analysis.files.forEach(file => {
    html += `
      <tr>
        <td>${file.file}</td>
        <td class="${file.overall < options.threshold ? 'fail' : 'pass'}">${file.overall.toFixed(2)}%</td>
        <td>${file.lines.toFixed(2)}%</td>
        <td>${file.functions.toFixed(2)}%</td>
        <td>${file.branches.toFixed(2)}%</td>
      </tr>`;
  });
  
  html += `
    </table>
  </div>
</body>
</html>`;

  return html;
}

// Simple minimatch implementation (for the ignore patterns)
function minimatch(filepath, pattern) {
  // Convert glob pattern to regex
  const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
  return regex.test(filepath);
}

// Run the main function
main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
}); 