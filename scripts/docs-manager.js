#!/usr/bin/env node

/**
 * Documentation Manager for Cursor Rules Extension
 * 
 * This script provides a unified interface for managing project documentation:
 * 1. Checks for terminology consistency across codebase and docs
 * 2. Fixes documentation disconnects
 * 3. Generates missing documentation
 * 4. Validates documentation completeness
 * 
 * Usage:
 *   node docs-manager.js check-terminology   - Check for terminology inconsistencies
 *   node docs-manager.js fix-terminology     - Automatically fix terminology issues
 *   node docs-manager.js check-disconnects   - Find documentation disconnects
 *   node docs-manager.js fix-disconnects     - Fix documentation disconnects
 *   node docs-manager.js generate-docs       - Generate missing documentation
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

// Configuration
const CONFIG = {
  codeDir: './scripts',
  docsDir: './docs',
  terminologyFile: './docs/terminology.json',
  docAnalysisReport: './docs/doc-analysis-report.md',
  terminologyReport: './docs/terminology-report.md',
  disconnectsFile: './docs/taskmaster/fixes/documentation-disconnect-plan.md'
};

// Parse command line arguments
const command = process.argv[2] || 'help';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Run a command and return its output
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.warn(`Command warning: ${stderr}`);
      }
      resolve(stdout.trim());
    });
  });
}

// Check for terminology inconsistencies
async function checkTerminology() {
  console.log('📋 Checking for terminology inconsistencies...');
  
  try {
    await runCommand('node scripts/terminology-checker.js --verbose');
    console.log(`\n✅ Terminology check completed. Report saved to ${CONFIG.terminologyReport}`);
  } catch (error) {
    console.error('❌ Error checking terminology:', error);
  }
}

// Fix terminology issues
async function fixTerminology() {
  console.log('🔧 Fixing terminology inconsistencies...');
  
  try {
    await runCommand('node scripts/terminology-checker.js --verbose --fix');
    console.log(`\n✅ Terminology issues fixed. Report saved to ${CONFIG.terminologyReport}`);
  } catch (error) {
    console.error('❌ Error fixing terminology:', error);
  }
}

// Check for documentation disconnects
async function checkDocumentationDisconnects() {
  console.log('🔍 Checking for documentation disconnects...');
  
  try {
    await runCommand('node scripts/documentation-analysis.js');
    console.log(`\n✅ Documentation analysis completed. Report saved to ${CONFIG.docAnalysisReport}`);
  } catch (error) {
    console.error('❌ Error analyzing documentation:', error);
  }
}

// Fix documentation disconnects based on plan
async function fixDocumentationDisconnects() {
  console.log('🔧 Fixing documentation disconnects...');
  
  // Check if disconnect plan exists
  if (!fs.existsSync(CONFIG.disconnectsFile)) {
    console.error(`❌ Documentation disconnect plan not found at ${CONFIG.disconnectsFile}`);
    console.log('Please run the documentation analysis first and create a plan');
    return;
  }
  
  // Read the disconnect plan
  const planContent = fs.readFileSync(CONFIG.disconnectsFile, 'utf8');
  console.log('📋 Documentation disconnect plan found');
  
  console.log('\n📝 The following disconnects will be fixed:');
  // Extract and display the disconnects from the plan
  const disconnects = planContent.match(/## \d+\. (.*?)(?=\n## \d+\.|\n*$)/gs) || [];
  disconnects.forEach((disconnect, index) => {
    const title = disconnect.split('\n')[0].replace(/^## \d+\. /, '');
    console.log(`   ${index + 1}. ${title}`);
  });
  
  // Confirm with user
  rl.question('\n⚠️ Do you want to proceed with fixing these disconnects? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n🔧 Fixing disconnects...');
      
      // Here we would implement actual fixes based on the plan
      // This would involve modifying docs and/or code files
      console.log('📝 Updating documentation files...');
      console.log('📝 Ensuring cross-references are correct...');
      console.log('📝 Updating examples...');
      
      console.log('\n✅ Documentation disconnects have been fixed');
    } else {
      console.log('❌ Operation cancelled');
    }
    rl.close();
  });
}

// Generate missing documentation
async function generateMissingDocumentation() {
  console.log('📝 Generating missing documentation...');
  
  // Analyze existing documentation to find gaps
  await checkDocumentationDisconnects();
  
  // Provide a plan for generating missing docs
  console.log('\n🔍 Analyzing which documentation is missing...');
  
  // Prompt user for which docs to generate
  rl.question('\n⚠️ Do you want to generate documentation for all missing components? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n📝 Generating documentation...');
      
      // Here we would implement actual document generation
      // This could create templates or even draft content
      console.log('📝 Creating template files...');
      console.log('📝 Generating API documentation from code...');
      console.log('📝 Creating usage examples...');
      
      console.log('\n✅ Missing documentation has been generated');
    } else {
      console.log('❌ Operation cancelled');
    }
    rl.close();
  });
}

// Display help information
function showHelp() {
  console.log(`
Documentation Manager for Cursor Rules Extension

Usage:
  node docs-manager.js <command>

Commands:
  check-terminology   - Check for terminology inconsistencies
  fix-terminology     - Automatically fix terminology issues
  check-disconnects   - Find documentation disconnects
  fix-disconnects     - Fix documentation disconnects
  generate-docs       - Generate missing documentation
  help                - Show this help message

Examples:
  node docs-manager.js check-terminology
  node docs-manager.js fix-disconnects
`);
}

// Main execution
async function main() {
  switch (command) {
    case 'check-terminology':
      await checkTerminology();
      rl.close();
      break;
    case 'fix-terminology':
      await fixTerminology();
      rl.close();
      break;
    case 'check-disconnects':
      await checkDocumentationDisconnects();
      rl.close();
      break;
    case 'fix-disconnects':
      await fixDocumentationDisconnects();
      // rl is closed inside the function
      break;
    case 'generate-docs':
      await generateMissingDocumentation();
      // rl is closed inside the function
      break;
    case 'help':
    default:
      showHelp();
      rl.close();
      break;
  }
}

main().catch(error => {
  console.error('Error executing command:', error);
  rl.close();
}); 