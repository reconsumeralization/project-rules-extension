#!/usr/bin/env node

/**
 * Documentation-Code Analyzer
 * 
 * This script analyzes documentation and code files to identify disconnects:
 * - Features documented but not implemented
 * - Terminology inconsistencies
 * - Missing error handling documentation
 * - Capability claims without implementation
 * 
 * Usage:
 *   node doc-code-analyzer.js --scan-all              // Scan entire project
 *   node doc-code-analyzer.js --scan-module=taskmaster // Scan specific module
 *   node doc-code-analyzer.js --report-format=markdown // Output format
 *   node doc-code-analyzer.js --fix-terminology        // Auto-fix terminology 
 *   node doc-code-analyzer.js --interactive           // Interactive mode
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parse command line arguments
const args = process.argv.slice(2);
const SCAN_ALL = args.includes('--scan-all');
const FIX_TERMINOLOGY = args.includes('--fix-terminology');
const INTERACTIVE_MODE = args.includes('--interactive');
const MODULE_ARG = args.find(arg => arg.startsWith('--scan-module='));
const TARGET_MODULE = MODULE_ARG ? MODULE_ARG.split('=')[1] : null;
const FORMAT_ARG = args.find(arg => arg.startsWith('--report-format='));
const REPORT_FORMAT = FORMAT_ARG ? FORMAT_ARG.split('=')[1] : 'console';

// Configuration
const config = {
  docExtensions: ['.md', '.mdc'],
  codeExtensions: ['.js', '.ts', '.jsx', '.tsx'],
  docDirectories: ['docs', 'README.md'],
  featureKeywords: ['integrates', 'automatically', 'AI-driven', 'analyzes', 'generates'],
  errorHandlingKeywords: ['error', 'exception', 'fail', 'invalid', 'warning'],
  termMappingFile: 'docs/terminology.json',
  reportOutput: 'docs/taskmaster/fixes/documentation-analysis-report',
  ignoreDirs: ['node_modules', 'dist', '.git']
};

// Results storage
const results = {
  docFeatureClaims: [],
  missingImplementations: [],
  terminologyInconsistencies: [],
  missingErrorDocs: [],
  overPromisedCapabilities: []
};

/**
 * Find all files with given extensions in directories
 */
function findFiles(directories, extensions, ignore = []) {
  let files = [];
  
  for (const dir of directories) {
    try {
      if (fs.existsSync(dir)) {
        if (fs.lstatSync(dir).isDirectory()) {
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const fullPath = path.join(dir, item);
            
            // Skip ignored directories
            if (fs.lstatSync(fullPath).isDirectory()) {
              if (!ignore.includes(item)) {
                files = files.concat(findFiles([fullPath], extensions, ignore));
              }
            } else {
              // Check if file has one of the target extensions
              if (extensions.includes(path.extname(fullPath))) {
                files.push(fullPath);
              }
            }
          }
        } else if (extensions.includes(path.extname(dir))) {
          // Single file was provided
          files.push(dir);
        }
      }
    } catch (error) {
      console.error(`Error accessing ${dir}: ${error.message}`);
    }
  }
  
  return files;
}

/**
 * Extract feature claims from documentation
 */
function extractFeatureClaims(docFiles) {
  const claims = [];
  
  for (const file of docFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if line contains feature keywords
      for (const keyword of config.featureKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          claims.push({
            file,
            line: i + 1,
            text: line.trim(),
            keyword
          });
        }
      }
    }
  }
  
  return claims;
}

/**
 * Check if features claimed in docs are implemented in code
 */
function checkFeatureImplementations(featureClaims, codeFiles) {
  const missing = [];
  
  for (const claim of featureClaims) {
    let found = false;
    const searchTerms = claim.text
      .replace(/[^\w\s]/g, ' ')
      .split(' ')
      .filter(word => word.length > 4)
      .map(word => word.toLowerCase());
    
    if (searchTerms.length === 0) {continue;}
    
    // Look for evidence of implementation in code
    for (const file of codeFiles) {
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      
      // Check if enough search terms are found to suggest implementation
      const matchCount = searchTerms.filter(term => content.includes(term)).length;
      if (matchCount >= Math.ceil(searchTerms.length / 3)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      missing.push({
        ...claim,
        searchTerms
      });
    }
  }
  
  return missing;
}

/**
 * Check for terminology inconsistencies
 */
function checkTerminologyConsistency(allFiles) {
  const terms = {};
  const inconsistencies = [];
  
  // Define common term variations to check
  const commonTerms = {
    'mcp': ['mcp', 'model context protocol', 'model-context-protocol'],
    'taskmaster': ['taskmaster', 'task master', 'task-master'],
    'ai': ['ai', 'artificial intelligence', 'a.i.'],
    'analyze': ['analyze', 'analyse', 'analyzing', 'analysing']
  };
  
  // Look for term variations in files
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8').toLowerCase();
    
    for (const [canonicalTerm, variations] of Object.entries(commonTerms)) {
      for (const variation of variations) {
        if (content.includes(variation)) {
          if (!terms[canonicalTerm]) {
            terms[canonicalTerm] = [];
          }
          
          if (!terms[canonicalTerm].includes(variation)) {
            terms[canonicalTerm].push(variation);
          }
          
          // If we find more than one variation used, record an inconsistency
          if (terms[canonicalTerm].length > 1) {
            inconsistencies.push({
              term: canonicalTerm,
              variations: terms[canonicalTerm],
              file
            });
            
            // Only record one inconsistency per term per file
            break;
          }
        }
      }
    }
  }
  
  // Deduplicate inconsistencies by file
  const uniqueInconsistencies = [];
  const seen = new Set();
  
  for (const item of inconsistencies) {
    const key = `${item.term}-${item.file}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueInconsistencies.push(item);
    }
  }
  
  return uniqueInconsistencies;
}

/**
 * Check for missing error handling documentation
 */
function checkErrorHandlingDocs(codeFiles, docFiles) {
  const missingErrorDocs = [];
  
  // Find error handling in code
  for (const file of codeFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for error handling code
      if (line.includes('catch') || line.includes('try') || 
          (line.includes('if') && config.errorHandlingKeywords.some(kw => line.includes(kw)))) {
        
        // Extract context (function name or nearby comments)
        let context = '';
        let errorType = '';
        
        // Look backward for function name or comment
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          if (lines[j].includes('function') || lines[j].includes('=>')) {
            context = lines[j].trim();
            break;
          } else if (lines[j].includes('*') || lines[j].includes('//')) {
            context = lines[j].trim();
            break;
          }
        }
        
        // Try to identify error type
        for (const kw of config.errorHandlingKeywords) {
          if (line.includes(kw)) {
            errorType = kw;
            break;
          }
        }
        
        // Check if this error case is documented
        let documented = false;
        const searchTerm = context.replace(/[^\w\s]/g, ' ').split(' ').filter(word => word.length > 3);
        
        for (const docFile of docFiles) {
          const docContent = fs.readFileSync(docFile, 'utf8').toLowerCase();
          
          if (searchTerm.some(term => docContent.includes(term.toLowerCase())) && 
              docContent.includes(errorType.toLowerCase())) {
            documented = true;
            break;
          }
        }
        
        if (!documented) {
          missingErrorDocs.push({
            file,
            line: i + 1,
            context,
            errorType,
            errorHandlingCode: line.trim()
          });
        }
      }
    }
  }
  
  return missingErrorDocs;
}

/**
 * Check for overpromised capabilities
 */
function checkOverpromisedCapabilities(docFiles, codeFiles) {
  const overPromised = [];
  const capabilityWords = [
    'autonomous', 'automatically', 'intelligent', 'learns', 'adapts',
    'optimizes', 'improves', 'predicts', 'suggests', 'recommends'
  ];
  
  // Extract capability claims from docs
  for (const file of docFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      for (const word of capabilityWords) {
        if (line.includes(word)) {
          // Look for substantiation in code
          let substantiated = false;
          const context = line.replace(/[^\w\s]/g, ' ').trim();
          
          for (const codeFile of codeFiles) {
            const codeContent = fs.readFileSync(codeFile, 'utf8').toLowerCase();
            
            // Check if there's actual implementation or just comments/simulations
            if (codeContent.includes(word) && 
                !codeContent.includes(`// ${word}`) && 
                !codeContent.includes('simulation') && 
                !codeContent.includes('simulated')) {
              substantiated = true;
              break;
            }
          }
          
          if (!substantiated) {
            overPromised.push({
              file,
              line: i + 1,
              text: lines[i].trim(),
              capability: word
            });
          }
          
          break; // Only record one capability per line
        }
      }
    }
  }
  
  return overPromised;
}

/**
 * Generate report based on findings
 */
function generateReport(results) {
  switch (REPORT_FORMAT) {
    case 'markdown':
      return generateMarkdownReport(results);
    case 'json':
      return JSON.stringify(results, null, 2);
    case 'console':
    default:
      return generateConsoleReport(results);
  }
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results) {
  let markdown = `# Documentation Analysis Report\n\n`;
  markdown += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
  
  markdown += `## Summary\n\n`;
  markdown += `- **Missing Implementations**: ${results.missingImplementations.length}\n`;
  markdown += `- **Terminology Inconsistencies**: ${results.terminologyInconsistencies.length}\n`;
  markdown += `- **Missing Error Documentation**: ${results.missingErrorDocs.length}\n`;
  markdown += `- **Overpromised Capabilities**: ${results.overPromisedCapabilities.length}\n\n`;
  
  if (results.missingImplementations.length > 0) {
    markdown += `## Features Claimed But Not Implemented\n\n`;
    
    for (const item of results.missingImplementations) {
      markdown += `### ${item.keyword.charAt(0).toUpperCase() + item.keyword.slice(1)} Feature - ${path.basename(item.file)}\n\n`;
      markdown += `- **File**: \`${item.file}\`\n`;
      markdown += `- **Line ${item.line}**: "${item.text}"\n`;
      markdown += `- **Search Terms**: ${item.searchTerms.join(', ')}\n\n`;
    }
  }
  
  if (results.terminologyInconsistencies.length > 0) {
    markdown += `## Terminology Inconsistencies\n\n`;
    
    const termGroups = {};
    
    // Group by term
    for (const item of results.terminologyInconsistencies) {
      if (!termGroups[item.term]) {
        termGroups[item.term] = [];
      }
      termGroups[item.term].push(item);
    }
    
    for (const [term, items] of Object.entries(termGroups)) {
      markdown += `### Term: "${term}"\n\n`;
      markdown += `- **Variations Found**: ${[...new Set(items.flatMap(i => i.variations))].join(', ')}\n`;
      markdown += `- **Affected Files**:\n`;
      
      for (const item of items) {
        markdown += `  - \`${item.file}\`\n`;
      }
      
      markdown += `\n**Recommendation**: Standardize on "${term}"\n\n`;
    }
  }
  
  if (results.missingErrorDocs.length > 0) {
    markdown += `## Missing Error Handling Documentation\n\n`;
    
    for (const item of results.missingErrorDocs) {
      markdown += `### Error in ${path.basename(item.file)}\n\n`;
      markdown += `- **File**: \`${item.file}\`\n`;
      markdown += `- **Line ${item.line}**: \`${item.errorHandlingCode}\`\n`;
      markdown += `- **Context**: \`${item.context}\`\n`;
      markdown += `- **Error Type**: ${item.errorType}\n\n`;
    }
  }
  
  if (results.overPromisedCapabilities.length > 0) {
    markdown += `## Overpromised Capabilities\n\n`;
    
    for (const item of results.overPromisedCapabilities) {
      markdown += `### ${item.capability.charAt(0).toUpperCase() + item.capability.slice(1)} Claim - ${path.basename(item.file)}\n\n`;
      markdown += `- **File**: \`${item.file}\`\n`;
      markdown += `- **Line ${item.line}**: "${item.text}"\n`;
      markdown += `- **Claimed Capability**: ${item.capability}\n\n`;
    }
  }
  
  return markdown;
}

/**
 * Generate console report
 */
function generateConsoleReport(results) {
  let report = '\n=== DOCUMENTATION ANALYSIS REPORT ===\n\n';
  
  report += `SUMMARY:\n`;
  report += `- Missing Implementations: ${results.missingImplementations.length}\n`;
  report += `- Terminology Inconsistencies: ${results.terminologyInconsistencies.length}\n`;
  report += `- Missing Error Documentation: ${results.missingErrorDocs.length}\n`;
  report += `- Overpromised Capabilities: ${results.overPromisedCapabilities.length}\n\n`;
  
  if (results.missingImplementations.length > 0) {
    report += `FEATURES CLAIMED BUT NOT IMPLEMENTED:\n`;
    
    for (const item of results.missingImplementations) {
      report += `[${item.keyword}] ${path.basename(item.file)}:${item.line} - "${item.text}"\n`;
    }
    
    report += '\n';
  }
  
  if (results.terminologyInconsistencies.length > 0) {
    report += `TERMINOLOGY INCONSISTENCIES:\n`;
    
    const termGroups = {};
    
    // Group by term
    for (const item of results.terminologyInconsistencies) {
      if (!termGroups[item.term]) {
        termGroups[item.term] = [];
      }
      termGroups[item.term].push(item);
    }
    
    for (const [term, items] of Object.entries(termGroups)) {
      report += `[${term}] Variations: ${[...new Set(items.flatMap(i => i.variations))].join(', ')}\n`;
      report += `  Affected files: ${items.map(i => path.basename(i.file)).join(', ')}\n`;
    }
    
    report += '\n';
  }
  
  if (results.missingErrorDocs.length > 0) {
    report += `MISSING ERROR HANDLING DOCUMENTATION:\n`;
    
    for (const item of results.missingErrorDocs) {
      report += `[${item.errorType}] ${path.basename(item.file)}:${item.line} - ${item.errorHandlingCode}\n`;
    }
    
    report += '\n';
  }
  
  if (results.overPromisedCapabilities.length > 0) {
    report += `OVERPROMISED CAPABILITIES:\n`;
    
    for (const item of results.overPromisedCapabilities) {
      report += `[${item.capability}] ${path.basename(item.file)}:${item.line} - "${item.text}"\n`;
    }
    
    report += '\n';
  }
  
  return report;
}

// Add interactive mode functions
/**
 * Show interactive menu
 */
async function showInteractiveMenu() {
  console.clear();
  console.log('=== Documentation-Code Analyzer Interactive Mode ===');
  console.log('');
  console.log('What would you like to do?');
  console.log('1. Scan for documentation issues');
  console.log('2. View feature claims without implementation');
  console.log('3. View terminology inconsistencies');
  console.log('4. View missing error documentation');
  console.log('5. View overpromised capabilities');
  console.log('6. Generate report');
  console.log('7. Exit');
  console.log('');
  
  const answer = await askQuestion('Enter your choice (1-7): ');
  
  switch (answer) {
    case '1':
      await scanInteractively();
      break;
    case '2':
      await viewMissingImplementations();
      break;
    case '3':
      await viewTerminologyIssues();
      break;
    case '4':
      await viewMissingErrorDocs();
      break;
    case '5':
      await viewOverpromisedCapabilities();
      break;
    case '6':
      await generateReportInteractively();
      break;
    case '7':
      rl.close();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await showInteractiveMenu();
  }
}

/**
 * Scan for issues interactively
 */
async function scanInteractively() {
  console.clear();
  console.log('Scanning for documentation issues...');
  
  let targetModule = TARGET_MODULE;
  if (!SCAN_ALL && !targetModule) {
    console.log('\nWhich module would you like to scan?');
    console.log('1. All modules');
    console.log('2. Taskmaster');
    console.log('3. Rules engine');
    console.log('4. MCP integration');
    console.log('5. Custom module');
    
    const moduleChoice = await askQuestion('Enter your choice (1-5): ');
    
    switch (moduleChoice) {
      case '1':
        // All modules
        break;
      case '2':
        targetModule = 'taskmaster';
        break;
      case '3':
        targetModule = 'rules';
        break;
      case '4':
        targetModule = 'mcp';
        break;
      case '5':
        targetModule = await askQuestion('Enter module name: ');
        break;
      default:
        console.log('Invalid choice. Scanning all modules.');
    }
  }
  
  // Call the main scanning function with the appropriate module
  const docFiles = findDocFiles(targetModule);
  const codeFiles = findCodeFiles(targetModule);
  
  console.log(`Found ${docFiles.length} documentation files and ${codeFiles.length} code files.`);
  
  // Extract features from docs
  console.log('Analyzing documentation for feature claims...');
  results.docFeatureClaims = extractFeatureClaims(docFiles);
  console.log(`Found ${results.docFeatureClaims.length} feature claims in documentation.`);
  
  // Check if features are implemented
  console.log('Checking feature implementations in code...');
  results.missingImplementations = checkFeatureImplementations(results.docFeatureClaims, codeFiles);
  console.log(`Found ${results.missingImplementations.length} features without implementation.`);
  
  // Check for terminology inconsistencies
  console.log('Checking for terminology inconsistencies...');
  results.terminologyInconsistencies = checkTerminologyConsistency([...docFiles, ...codeFiles]);
  console.log(`Found ${results.terminologyInconsistencies.length} terminology inconsistencies.`);
  
  // Check error handling documentation
  console.log('Checking error handling documentation...');
  results.missingErrorDocs = checkErrorHandlingDocs(codeFiles, docFiles);
  console.log(`Found ${results.missingErrorDocs.length} missing error documentation items.`);
  
  // Check for overpromised capabilities
  console.log('Checking for overpromised capabilities...');
  results.overPromisedCapabilities = checkOverpromisedCapabilities(docFiles, codeFiles);
  console.log(`Found ${results.overPromisedCapabilities.length} potentially overpromised capabilities.`);
  
  // Save results to JSON file
  const resultPath = `${config.reportOutput}.json`;
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultPath}`);
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

/**
 * View missing implementations
 */
async function viewMissingImplementations() {
  console.clear();
  console.log('=== Features Without Implementation ===');
  console.log('');
  
  if (results.missingImplementations.length === 0) {
    console.log('No missing implementations found.');
    await pressEnterToContinue();
    await showInteractiveMenu();
    return;
  }
  
  console.log(`Found ${results.missingImplementations.length} features without implementation:`);
  console.log('');
  
  for (let i = 0; i < results.missingImplementations.length; i++) {
    const item = results.missingImplementations[i];
    console.log(`${i + 1}. In ${item.file} (line ${item.line}):`);
    console.log(`   "${item.text}"`);
    console.log(`   Search terms: ${item.searchTerms.join(', ')}`);
    console.log('');
  }
  
  console.log('Options:');
  console.log('1. Generate stub implementation for a feature');
  console.log('2. Mark feature as "won\'t implement"');
  console.log('3. Back to main menu');
  
  const answer = await askQuestion('Enter your choice (1-3): ');
  
  if (answer === '1') {
    const itemIndex = await askQuestion('Which feature would you like to generate a stub for? (number): ');
    const index = parseInt(itemIndex, 10) - 1;
    
    if (index >= 0 && index < results.missingImplementations.length) {
      await generateStub(results.missingImplementations[index]);
    } else {
      console.log('Invalid feature number.');
    }
  } else if (answer === '2') {
    const itemIndex = await askQuestion('Which feature would you like to mark as "won\'t implement"? (number): ');
    const index = parseInt(itemIndex, 10) - 1;
    
    if (index >= 0 && index < results.missingImplementations.length) {
      await markAsWontImplement(results.missingImplementations[index]);
    } else {
      console.log('Invalid feature number.');
    }
  }
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

/**
 * View terminology issues
 */
async function viewTerminologyIssues() {
  console.clear();
  console.log('=== Terminology Inconsistencies ===');
  console.log('');
  
  if (results.terminologyInconsistencies.length === 0) {
    console.log('No terminology inconsistencies found.');
    await pressEnterToContinue();
    await showInteractiveMenu();
    return;
  }
  
  console.log(`Found ${results.terminologyInconsistencies.length} terminology inconsistencies:`);
  console.log('');
  
  // Group by term
  const termGroups = {};
  for (const issue of results.terminologyInconsistencies) {
    if (!termGroups[issue.term]) {
      termGroups[issue.term] = {
        term: issue.term,
        preferred: issue.preferred,
        variations: [],
        occurrences: []
      };
    }
    
    if (!termGroups[issue.term].variations.includes(issue.found)) {
      termGroups[issue.term].variations.push(issue.found);
    }
    
    termGroups[issue.term].occurrences.push({
      file: issue.file,
      found: issue.found,
      line: issue.lineInfo?.line || 'unknown'
    });
  }
  
  const terms = Object.keys(termGroups);
  for (let i = 0; i < terms.length; i++) {
    const group = termGroups[terms[i]];
    console.log(`${i + 1}. Term: "${group.term}"`);
    console.log(`   Preferred: "${group.preferred}"`);
    console.log(`   Variations found: ${group.variations.join(', ')}`);
    console.log(`   Occurrences: ${group.occurrences.length} instances`);
    console.log('');
  }
  
  console.log('Options:');
  console.log('1. Fix all terminology inconsistencies');
  console.log('2. Fix a specific term');
  console.log('3. View detailed occurrences for a term');
  console.log('4. Back to main menu');
  
  const answer = await askQuestion('Enter your choice (1-4): ');
  
  if (answer === '1') {
    console.log('Fixing all terminology inconsistencies...');
    // Launch the terminology fixer
    try {
      execSync('node scripts/terminology-fixer.js --fix', { stdio: 'inherit' });
    } catch (error) {
      console.error(`Error fixing terminology: ${error.message}`);
    }
  } else if (answer === '2') {
    const termIndex = await askQuestion('Which term would you like to fix? (number): ');
    const index = parseInt(termIndex, 10) - 1;
    
    if (index >= 0 && index < terms.length) {
      const term = terms[index];
      console.log(`Fixing term: ${term}`);
      // TODO: Implement specific term fixing
      console.log('This functionality is not yet implemented.');
    } else {
      console.log('Invalid term number.');
    }
  } else if (answer === '3') {
    const termIndex = await askQuestion('Which term would you like to view details for? (number): ');
    const index = parseInt(termIndex, 10) - 1;
    
    if (index >= 0 && index < terms.length) {
      const group = termGroups[terms[index]];
      console.log(`\nDetailed occurrences for "${group.term}":`);
      
      for (let j = 0; j < group.occurrences.length; j++) {
        const occ = group.occurrences[j];
        console.log(`${j + 1}. In ${occ.file} (line ${occ.line}): "${occ.found}"`);
      }
    } else {
      console.log('Invalid term number.');
    }
  }
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

/**
 * View missing error docs
 */
async function viewMissingErrorDocs() {
  console.clear();
  console.log('=== Missing Error Documentation ===');
  console.log('');
  
  if (results.missingErrorDocs.length === 0) {
    console.log('No missing error documentation found.');
    await pressEnterToContinue();
    await showInteractiveMenu();
    return;
  }
  
  console.log(`Found ${results.missingErrorDocs.length} missing error documentation items:`);
  console.log('');
  
  for (let i = 0; i < results.missingErrorDocs.length; i++) {
    const item = results.missingErrorDocs[i];
    console.log(`${i + 1}. In ${item.codeFile} (function: ${item.function}):`);
    console.log(`   Error: "${item.errorText}"`);
    console.log(`   Missing documentation in: ${item.docFile || 'any documentation'}`);
    console.log('');
  }
  
  console.log('Options:');
  console.log('1. Generate error documentation template');
  console.log('2. Back to main menu');
  
  const answer = await askQuestion('Enter your choice (1-2): ');
  
  if (answer === '1') {
    const itemIndex = await askQuestion('Which error would you like to document? (number): ');
    const index = parseInt(itemIndex, 10) - 1;
    
    if (index >= 0 && index < results.missingErrorDocs.length) {
      await generateErrorDocTemplate(results.missingErrorDocs[index]);
    } else {
      console.log('Invalid error number.');
    }
  }
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

/**
 * View overpromised capabilities
 */
async function viewOverpromisedCapabilities() {
  console.clear();
  console.log('=== Potentially Overpromised Capabilities ===');
  console.log('');
  
  if (results.overPromisedCapabilities.length === 0) {
    console.log('No overpromised capabilities found.');
    await pressEnterToContinue();
    await showInteractiveMenu();
    return;
  }
  
  console.log(`Found ${results.overPromisedCapabilities.length} potentially overpromised capabilities:`);
  console.log('');
  
  for (let i = 0; i < results.overPromisedCapabilities.length; i++) {
    const item = results.overPromisedCapabilities[i];
    console.log(`${i + 1}. In ${item.file} (line ${item.line}):`);
    console.log(`   "${item.text}"`);
    console.log(`   Reason: ${item.reason}`);
    console.log('');
  }
  
  console.log('Options:');
  console.log('1. Update documentation for capability');
  console.log('2. Add to limitations section');
  console.log('3. Back to main menu');
  
  const answer = await askQuestion('Enter your choice (1-3): ');
  
  if (answer === '1') {
    const itemIndex = await askQuestion('Which capability would you like to update? (number): ');
    const index = parseInt(itemIndex, 10) - 1;
    
    if (index >= 0 && index < results.overPromisedCapabilities.length) {
      await updateDocForCapability(results.overPromisedCapabilities[index]);
    } else {
      console.log('Invalid capability number.');
    }
  } else if (answer === '2') {
    const itemIndex = await askQuestion('Which capability would you like to add to limitations? (number): ');
    const index = parseInt(itemIndex, 10) - 1;
    
    if (index >= 0 && index < results.overPromisedCapabilities.length) {
      await addToLimitations(results.overPromisedCapabilities[index]);
    } else {
      console.log('Invalid capability number.');
    }
  }
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

/**
 * Generate report interactively
 */
async function generateReportInteractively() {
  console.clear();
  console.log('=== Generate Documentation Report ===');
  console.log('');
  
  console.log('Select report format:');
  console.log('1. Markdown');
  console.log('2. Console output');
  console.log('3. JSON');
  console.log('4. Back to main menu');
  
  const answer = await askQuestion('Enter your choice (1-4): ');
  
  let format;
  switch (answer) {
    case '1':
      format = 'markdown';
      break;
    case '2':
      format = 'console';
      break;
    case '3':
      format = 'json';
      break;
    case '4':
      await showInteractiveMenu();
      return;
    default:
      console.log('Invalid choice. Using markdown format.');
      format = 'markdown';
  }
  
  console.log(`Generating ${format} report...`);
  
  if (format === 'markdown') {
    const report = generateMarkdownReport(results);
    const reportPath = `${config.reportOutput}.markdown`;
    fs.writeFileSync(reportPath, report);
    console.log(`Report saved to ${reportPath}`);
  } else if (format === 'json') {
    const reportPath = `${config.reportOutput}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`Report saved to ${reportPath}`);
  } else {
    console.log(generateConsoleReport(results));
  }
  
  await pressEnterToContinue();
  await showInteractiveMenu();
}

// Helper functions for interactive mode

/**
 * Generate stub implementation for a feature
 */
async function generateStub(feature) {
  console.log(`Generating stub for: ${feature.text}`);
  console.log('This functionality is not yet implemented.');
}

/**
 * Mark feature as won't implement
 */
async function markAsWontImplement(feature) {
  console.log(`Marking as won't implement: ${feature.text}`);
  console.log('This functionality is not yet implemented.');
}

/**
 * Generate error documentation template
 */
async function generateErrorDocTemplate(errorItem) {
  console.log(`Generating error documentation for: ${errorItem.errorText}`);
  console.log('This functionality is not yet implemented.');
}

/**
 * Update documentation for capability
 */
async function updateDocForCapability(capability) {
  console.log(`Updating documentation for: ${capability.text}`);
  console.log('This functionality is not yet implemented.');
}

/**
 * Add capability to limitations section
 */
async function addToLimitations(capability) {
  console.log(`Adding to limitations: ${capability.text}`);
  console.log('This functionality is not yet implemented.');
}

/**
 * Prompt for user input
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Wait for user to press Enter to continue
 */
async function pressEnterToContinue() {
  await askQuestion('\nPress Enter to continue...');
}

/**
 * Find doc files based on target module
 */
function findDocFiles(targetModule) {
  let docDirs = config.docDirectories;
  
  if (targetModule) {
    // If targeting a specific module, adjust doc directories
    docDirs = docDirs.map(dir => {
      if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
        return path.join(dir, targetModule);
      }
      return dir;
    }).filter(dir => fs.existsSync(dir));
  }
  
  return findFiles(docDirs, config.docExtensions, config.ignoreDirs);
}

/**
 * Find code files based on target module
 */
function findCodeFiles(targetModule) {
  let codeDirs = ['scripts', 'src'];
  
  if (targetModule) {
    // If targeting a specific module, adjust code directories
    codeDirs = codeDirs.map(dir => {
      if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
        const modulePath = path.join(dir, targetModule);
        if (fs.existsSync(modulePath)) {
          return modulePath;
        }
      }
      return dir;
    });
  }
  
  return findFiles(codeDirs, config.codeExtensions, config.ignoreDirs);
}

/**
 * Main function
 */
async function main() {
  console.log('📚 Documentation-Code Analyzer');
  
  // Interactive mode
  if (INTERACTIVE_MODE) {
    await showInteractiveMenu();
    return;
  }
  
  // Non-interactive operation (existing functionality)
  if (!SCAN_ALL && !TARGET_MODULE) {
    console.error('Please specify --scan-all or --scan-module=<name>');
    process.exit(1);
  }
  
  // ... existing implementation ...
}

// Start the application
if (INTERACTIVE_MODE) {
  main().catch(error => {
    console.error('An error occurred:', error);
    rl.close();
  });
} else {
  main();
}

// Handle clean exit in interactive mode
rl.on('close', () => {
  console.log('\nExiting Documentation-Code Analyzer. Goodbye!');
  process.exit(0);
}); 