#!/usr/bin/env node

/**
 * Interactive Documentation Fixer
 * 
 * This script provides an interactive interface for analyzing and fixing documentation issues,
 * including terminology inconsistencies, feature claims without implementation, etc.
 * 
 * Usage:
 *   node interactive-docs-fixer.js               // Run in fully interactive mode
 *   node interactive-docs-fixer.js --module=taskmaster // Focus on a specific module
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parse command line arguments
const args = process.argv.slice(2);
const MODULE_ARG = args.find(arg => arg.startsWith('--module='));
const TARGET_MODULE = MODULE_ARG ? MODULE_ARG.split('=')[1] : null;

// Configuration
const config = {
  docExtensions: ['.md', '.mdc'],
  codeExtensions: ['.js', '.ts', '.jsx', '.tsx'],
  terminologyFile: 'docs/taskmaster/fixes/terminology.json',
  reportOutput: 'docs/taskmaster/fixes/documentation-analysis-report',
  ignoreDirs: ['node_modules', 'dist', '.git', '.github'],
  scanDirs: ['scripts', 'docs']
};

// Store analysis results
let analysisResults = null;
let terminologyData = null;

/**
 * Display the main menu and handle user selection
 */
async function showMainMenu() {
  console.clear();
  console.log('=== Interactive Documentation Fixer ===');
  console.log('');
  console.log('What would you like to do?');
  console.log('1. Run documentation analysis');
  console.log('2. Check for terminology inconsistencies');
  console.log('3. Fix selected documentation issues');
  console.log('4. Fix all terminology issues');
  console.log('5. Generate documentation report');
  console.log('6. Exit');
  console.log('');

  const answer = await askQuestion('Enter your choice (1-6): ');
  
  switch (answer) {
    case '1':
      await runDocumentationAnalysis();
      break;
    case '2':
      await checkTerminology();
      break;
    case '3':
      await showFixMenu();
      break;
    case '4':
      await fixAllTerminology();
      break;
    case '5':
      await generateReport();
      break;
    case '6':
      rl.close();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await showMainMenu();
  }
}

/**
 * Run the documentation analysis
 */
async function runDocumentationAnalysis() {
  console.clear();
  console.log('Running documentation analysis...');
  
  let command = 'node scripts/doc-code-analyzer.js --scan-all';
  if (TARGET_MODULE) {
    command = `node scripts/doc-code-analyzer.js --scan-module=${TARGET_MODULE}`;
  }
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('\nAnalysis complete!');
    
    // Load the analysis results if available
    try {
      const reportPath = `${config.reportOutput}.json`;
      if (fs.existsSync(reportPath)) {
        analysisResults = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        console.log(`Loaded analysis results with ${analysisResults.terminologyInconsistencies.length} terminology issues.`);
      }
    } catch (error) {
      console.error(`Error loading analysis results: ${error.message}`);
    }
    
    await pressEnterToContinue();
    await showMainMenu();
  } catch (error) {
    console.error(`Error running analysis: ${error.message}`);
    await pressEnterToContinue();
    await showMainMenu();
  }
}

/**
 * Check for terminology inconsistencies
 */
async function checkTerminology() {
  console.clear();
  console.log('Checking for terminology inconsistencies...');
  
  let command = 'node scripts/terminology-fixer.js --check';
  if (TARGET_MODULE) {
    command = `node scripts/terminology-fixer.js --check --module=${TARGET_MODULE}`;
  }
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('\nTerminology check complete!');
    
    // Load terminology data if available
    try {
      const termFile = path.join(process.cwd(), config.terminologyFile);
      if (fs.existsSync(termFile)) {
        terminologyData = JSON.parse(fs.readFileSync(termFile, 'utf8'));
        console.log(`Loaded terminology definitions with ${Object.keys(terminologyData.canonicalTerms).length} canonical terms.`);
      }
    } catch (error) {
      console.error(`Error loading terminology data: ${error.message}`);
    }
    
    await pressEnterToContinue();
    await showMainMenu();
  } catch (error) {
    console.error(`Error checking terminology: ${error.message}`);
    await pressEnterToContinue();
    await showMainMenu();
  }
}

/**
 * Show the fix menu for selecting issues to fix
 */
async function showFixMenu() {
  console.clear();
  console.log('=== Fix Documentation Issues ===');
  console.log('');
  
  if (!analysisResults) {
    console.log('No analysis results available. Please run documentation analysis first.');
    await pressEnterToContinue();
    await showMainMenu();
    return;
  }
  
  console.log('Select category to fix:');
  console.log(`1. Terminology inconsistencies (${analysisResults.terminologyInconsistencies.length})`);
  console.log(`2. Missing implementations (${analysisResults.missingImplementations.length})`);
  console.log(`3. Missing error docs (${analysisResults.missingErrorDocs.length})`);
  console.log(`4. Overpromised capabilities (${analysisResults.overPromisedCapabilities.length})`);
  console.log('5. Back to main menu');
  console.log('');
  
  const answer = await askQuestion('Enter your choice (1-5): ');
  
  switch (answer) {
    case '1':
      await fixTerminologyInteractively();
      break;
    case '2':
      await handleMissingImplementations();
      break;
    case '3':
      await handleMissingErrorDocs();
      break;
    case '4':
      await handleOverpromisedCapabilities();
      break;
    case '5':
      await showMainMenu();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await showFixMenu();
  }
}

/**
 * Fix terminology issues interactively
 */
async function fixTerminologyInteractively() {
  console.clear();
  console.log('=== Fix Terminology Inconsistencies ===');
  console.log('');
  
  if (!analysisResults || analysisResults.terminologyInconsistencies.length === 0) {
    console.log('No terminology inconsistencies found.');
    await pressEnterToContinue();
    await showFixMenu();
    return;
  }
  
  // Group inconsistencies by file
  const issuesByFile = {};
  for (const issue of analysisResults.terminologyInconsistencies) {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  }
  
  // Show files with issues
  const files = Object.keys(issuesByFile);
  console.log(`Found terminology issues in ${files.length} files:`);
  
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file} (${issuesByFile[file].length} issues)`);
  });
  
  console.log(`${files.length + 1}. Fix all files`);
  console.log(`${files.length + 2}. Back to fix menu`);
  console.log('');
  
  const answer = await askQuestion(`Enter your choice (1-${files.length + 2}): `);
  const choice = parseInt(answer, 10);
  
  if (choice === files.length + 2) {
    await showFixMenu();
    return;
  } else if (choice === files.length + 1) {
    await fixAllTerminology();
    return;
  } else if (choice >= 1 && choice <= files.length) {
    const selectedFile = files[choice - 1];
    await fixFileTerminology(selectedFile, issuesByFile[selectedFile]);
  } else {
    console.log('Invalid choice. Please try again.');
    await pressEnterToContinue();
    await fixTerminologyInteractively();
  }
}

/**
 * Fix terminology for a specific file
 */
async function fixFileTerminology(file, issues) {
  console.clear();
  console.log(`=== Fixing Terminology in ${file} ===`);
  console.log('');
  
  // Read file content
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  // Sort issues by position in reverse order to avoid offset issues
  issues.sort((a, b) => b.position - a.position);
  
  for (const issue of issues) {
    console.log(`Issue: "${issue.found}" should be "${issue.preferred}" (line ${issue.lineInfo.line})`);
    console.log(`Context: ${issue.lineInfo.lineText}`);
    
    const answer = await askQuestion('Fix this issue? (y/n/a - all remaining): ');
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'a') {
      // Replace the term at the exact position
      const before = newContent.substring(0, issue.position);
      const after = newContent.substring(issue.position + issue.found.length);
      
      // Preserve case pattern if possible
      const replacement = matchCase(issue.preferred, issue.found);
      newContent = before + replacement + after;
      
      console.log(`Fixed: "${issue.found}" → "${replacement}"`);
      
      if (answer.toLowerCase() === 'a') {
        // Auto-fix remaining issues
        for (let i = 1; i < issues.length; i++) {
          const remainingIssue = issues[i];
          const before = newContent.substring(0, remainingIssue.position);
          const after = newContent.substring(remainingIssue.position + remainingIssue.found.length);
          const replacement = matchCase(remainingIssue.preferred, remainingIssue.found);
          newContent = before + replacement + after;
          console.log(`Auto-fixed: "${remainingIssue.found}" → "${replacement}"`);
        }
        break;
      }
    } else {
      console.log('Skipped.');
    }
    
    console.log('');
  }
  
  if (newContent !== content) {
    // Create backup
    fs.writeFileSync(`${file}.bak`, content);
    
    // Write changes
    fs.writeFileSync(file, newContent);
    console.log(`Updated ${file} and created backup at ${file}.bak`);
  } else {
    console.log('No changes were made to the file.');
  }
  
  await pressEnterToContinue();
  await fixTerminologyInteractively();
}

/**
 * Fix all terminology issues automatically
 */
async function fixAllTerminology() {
  console.clear();
  console.log('Fixing all terminology issues...');
  
  let command = 'node scripts/terminology-fixer.js --fix';
  if (TARGET_MODULE) {
    command = `node scripts/terminology-fixer.js --fix --module=${TARGET_MODULE}`;
  }
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('\nAll terminology issues fixed!');
    await pressEnterToContinue();
    await showMainMenu();
  } catch (error) {
    console.error(`Error fixing terminology: ${error.message}`);
    await pressEnterToContinue();
    await showMainMenu();
  }
}

/**
 * Handle missing implementations
 */
async function handleMissingImplementations() {
  console.clear();
  console.log('=== Missing Implementations ===');
  console.log('');
  
  if (!analysisResults || analysisResults.missingImplementations.length === 0) {
    console.log('No missing implementations found.');
    await pressEnterToContinue();
    await showFixMenu();
    return;
  }
  
  console.log('The following features are documented but not implemented:');
  console.log('');
  
  analysisResults.missingImplementations.forEach((item, index) => {
    console.log(`${index + 1}. In ${item.file} (line ${item.line}):`);
    console.log(`   "${item.text}"`);
    console.log(`   Search terms: ${item.searchTerms.join(', ')}`);
    console.log('');
  });
  
  console.log('Options:');
  console.log('1. Mark issue as "won\'t implement" (add to limitations section)');
  console.log('2. Generate stub implementation');
  console.log('3. Back to fix menu');
  
  const answer = await askQuestion('Enter your choice (1-3): ');
  
  switch (answer) {
    case '1':
      await markAsWontImplement();
      break;
    case '2':
      await generateStubImplementation();
      break;
    case '3':
      await showFixMenu();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await handleMissingImplementations();
  }
}

/**
 * Handle missing error docs
 */
async function handleMissingErrorDocs() {
  console.clear();
  console.log('=== Missing Error Documentation ===');
  console.log('');
  
  if (!analysisResults || analysisResults.missingErrorDocs.length === 0) {
    console.log('No missing error documentation found.');
    await pressEnterToContinue();
    await showFixMenu();
    return;
  }
  
  console.log('The following error handling lacks documentation:');
  console.log('');
  
  analysisResults.missingErrorDocs.forEach((item, index) => {
    console.log(`${index + 1}. In ${item.codeFile} (function: ${item.function}):`);
    console.log(`   Error: "${item.errorText}"`);
    console.log('');
  });
  
  console.log('Options:');
  console.log('1. Generate error documentation template');
  console.log('2. Back to fix menu');
  
  const answer = await askQuestion('Enter your choice (1-2): ');
  
  switch (answer) {
    case '1':
      await generateErrorDocTemplate();
      break;
    case '2':
      await showFixMenu();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await handleMissingErrorDocs();
  }
}

/**
 * Handle overpromised capabilities
 */
async function handleOverpromisedCapabilities() {
  console.clear();
  console.log('=== Overpromised Capabilities ===');
  console.log('');
  
  if (!analysisResults || analysisResults.overPromisedCapabilities.length === 0) {
    console.log('No overpromised capabilities found.');
    await pressEnterToContinue();
    await showFixMenu();
    return;
  }
  
  console.log('The following capabilities may be overpromised:');
  console.log('');
  
  analysisResults.overPromisedCapabilities.forEach((item, index) => {
    console.log(`${index + 1}. In ${item.file} (line ${item.line}):`);
    console.log(`   "${item.text}"`);
    console.log(`   Reason: ${item.reason}`);
    console.log('');
  });
  
  console.log('Options:');
  console.log('1. Update documentation to be more accurate');
  console.log('2. Back to fix menu');
  
  const answer = await askQuestion('Enter your choice (1-2): ');
  
  switch (answer) {
    case '1':
      await updateDocAccuracy();
      break;
    case '2':
      await showFixMenu();
      return;
    default:
      console.log('Invalid choice. Please try again.');
      await pressEnterToContinue();
      await handleOverpromisedCapabilities();
  }
}

/**
 * Mark issue as won't implement
 */
async function markAsWontImplement() {
  console.log('Functionality not yet implemented: Mark as won\'t implement');
  await pressEnterToContinue();
  await handleMissingImplementations();
}

/**
 * Generate stub implementation
 */
async function generateStubImplementation() {
  console.log('Functionality not yet implemented: Generate stub implementation');
  await pressEnterToContinue();
  await handleMissingImplementations();
}

/**
 * Generate error documentation template
 */
async function generateErrorDocTemplate() {
  console.log('Functionality not yet implemented: Generate error documentation template');
  await pressEnterToContinue();
  await handleMissingErrorDocs();
}

/**
 * Update documentation accuracy
 */
async function updateDocAccuracy() {
  console.log('Functionality not yet implemented: Update documentation accuracy');
  await pressEnterToContinue();
  await handleOverpromisedCapabilities();
}

/**
 * Generate a documentation report
 */
async function generateReport() {
  console.clear();
  console.log('Generating documentation report...');
  
  let command = 'node scripts/doc-code-analyzer.js --scan-all --report-format=markdown';
  if (TARGET_MODULE) {
    command = `node scripts/doc-code-analyzer.js --scan-module=${TARGET_MODULE} --report-format=markdown`;
  }
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('\nReport generated successfully!');
    await pressEnterToContinue();
    await showMainMenu();
  } catch (error) {
    console.error(`Error generating report: ${error.message}`);
    await pressEnterToContinue();
    await showMainMenu();
  }
}

/**
 * Preserve case pattern when replacing text
 */
function matchCase(replacement, original) {
  // If original is all uppercase, make replacement all uppercase
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  
  // If original is capitalized, capitalize the replacement
  if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  
  // Otherwise use replacement as is
  return replacement;
}

/**
 * Utility: Prompt user for input
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Utility: Wait for user to press Enter to continue
 */
async function pressEnterToContinue() {
  await askQuestion('\nPress Enter to continue...');
}

/**
 * Main function
 */
async function main() {
  console.clear();
  console.log('Interactive Documentation Fixer');
  console.log('==============================');
  
  if (TARGET_MODULE) {
    console.log(`Focused on module: ${TARGET_MODULE}`);
  }
  
  console.log('\nInitializing...\n');
  
  // Check if required scripts are available
  if (!fs.existsSync('scripts/doc-code-analyzer.js') || !fs.existsSync('scripts/terminology-fixer.js')) {
    console.error('Error: Required scripts not found.');
    console.error('Please ensure doc-code-analyzer.js and terminology-fixer.js exist in the scripts directory.');
    rl.close();
    return;
  }
  
  await showMainMenu();
}

// Handle clean exit
rl.on('close', () => {
  console.log('\nExiting Interactive Documentation Fixer. Goodbye!');
  process.exit(0);
});

// Start the application
main().catch(error => {
  console.error('An error occurred:', error);
  rl.close();
}); 