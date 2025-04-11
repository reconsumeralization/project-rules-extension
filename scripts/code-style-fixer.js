#!/usr/bin/env node

/**
 * Code Style Fixer
 * 
 * Automatically fixes common code style issues in the codebase according to project standards.
 * 
 * Usage:
 *   node code-style-fixer.js [options]
 * 
 * Options:
 *   --dir=<directory>       Directory to scan (default: src)
 *   --ext=<extensions>      File extensions to include, comma-separated (default: ts,tsx,js,jsx)
 *   --fix-naming            Fix naming convention issues (cautious)
 *   --fix-imports           Reorganize imports according to standards
 *   --fix-formatting        Fix formatting issues like line length, indentation
 *   --fix-all               Apply all fixes
 *   --dry-run               Show what would be fixed without making changes
 *   --verbose               Show detailed logs
 *   --backup                Create backup files before making changes
 *   --report=<format>       Output format for the report (json, table, none) (default: table)
 *   --report-file=<path>    Save report to a file instead of console
 * 
 * Examples:
 *   node code-style-fixer.js --dir=src --fix-imports --verbose
 *   node code-style-fixer.js --fix-all --dry-run
 *   node code-style-fixer.js --fix-formatting --report=json --report-file=format-fixes.json
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const glob = util.promisify(require('glob'));

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dir: 'src',
  extensions: ['ts', 'tsx', 'js', 'jsx'],
  fixNaming: false,
  fixImports: false,
  fixFormatting: false,
  dryRun: false,
  verbose: false,
  backup: false,
  report: 'table',
  reportFile: null
};

// Parse command line options
args.forEach(arg => {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1];
  } else if (arg.startsWith('--ext=')) {
    options.extensions = arg.split('=')[1].split(',');
  } else if (arg === '--fix-naming') {
    options.fixNaming = true;
  } else if (arg === '--fix-imports') {
    options.fixImports = true;
  } else if (arg === '--fix-formatting') {
    options.fixFormatting = true;
  } else if (arg === '--fix-all') {
    options.fixNaming = true;
    options.fixImports = true;
    options.fixFormatting = true;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--backup') {
    options.backup = true;
  } else if (arg.startsWith('--report=')) {
    options.report = arg.split('=')[1];
  } else if (arg.startsWith('--report-file=')) {
    options.reportFile = arg.split('=')[1];
  }
});

// Validate if at least one fix type is enabled
if (!options.fixNaming && !options.fixImports && !options.fixFormatting) {
  console.log('Warning: No fix type specified. Use --fix-naming, --fix-imports, --fix-formatting, or --fix-all');
  process.exit(1);
}

// Initialize results object
const results = {
  totalFiles: 0,
  filesFixed: 0,
  filesFailed: 0,
  filesSkipped: 0,
  fixesByType: {
    naming: 0,
    imports: 0,
    formatting: 0
  },
  fileDetails: []
};

// Regular expressions for different naming conventions
const namingPatterns = {
  components: /^[A-Z][A-Za-z0-9]*$/,
  hooks: /^use[A-Z][A-Za-z0-9]*$/,
  constants: /^[A-Z][A-Z0-9_]*$/,
  functions: /^[a-z][a-zA-Z0-9]*$/,
  variables: /^[a-z][a-zA-Z0-9]*$/,
  interfaces: /^I[A-Z][a-zA-Z0-9]*$/,
  types: /^T[A-Z][a-zA-Z0-9]*$/
};

// Defined import groups for ordering
const importGroups = [
  { name: 'React', pattern: /^react(-dom)?$/ },
  { name: 'External', pattern: /^[^\\.\\/]/ },
  { name: 'Internal', pattern: /^[@]\/|^[\.\\/]/ },
  { name: 'Styles', pattern: /\.(css|scss|less)$/ },
  { name: 'Types', pattern: /^types\/|types$/ }
];

// Formatting rules
const formattingRules = {
  maxLineLength: 100,
  indentation: 2,
  noSemicolon: true,
  trailingComma: true,
  singleQuote: true
};

/**
 * Find all files matching the specified criteria
 */
async function findFiles() {
  const pattern = `${options.dir}/**/*.{${options.extensions.join(',')}}`;
  return glob(pattern, { nodir: true });
}

/**
 * Create a backup of a file before modifying it
 */
async function backupFile(filePath) {
  if (!options.backup || options.dryRun) {return;}
  
  const backupPath = `${filePath}.backup`;
  try {
    await fs.promises.copyFile(filePath, backupPath);
    if (options.verbose) {
      console.log(`Created backup: ${backupPath}`);
    }
  } catch (error) {
    console.error(`Error creating backup for ${filePath}:`, error.message);
  }
}

/**
 * Fix naming conventions in the file content
 */
function fixNamingConventions(content, filePath) {
  if (!options.fixNaming) {return { content, fixed: 0 };}

  let fixedContent = content;
  let fixCount = 0;
  
  // This is a simplified implementation - a real implementation would use
  // AST parsing to reliably identify and rename variables, functions, etc.
  // For demonstration purposes, we'll just do some basic replacements
  
  // Example: Fix component names (should start with uppercase)
  const componentPattern = /const\s+([a-z][a-zA-Z0-9]*)\s+=\s+\(\s*(\{.*?\}|\w+)?\s*\)\s+=>/g;
  fixedContent = fixedContent.replace(componentPattern, (match, name, props) => {
    const fixedName = name.charAt(0).toUpperCase() + name.slice(1);
    fixCount++;
    return `const ${fixedName} = (${props || ''}) =>`;
  });

  // Example: Fix hook names (should start with 'use')
  const hookPattern = /function\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(\s*(\{.*?\}|\w+)?\s*\)\s*\{.*?useState|useEffect|useContext|useReducer|useCallback|useMemo|useRef/gs;
  fixedContent = fixedContent.replace(hookPattern, (match, name, params) => {
    if (!name.startsWith('use')) {
      const fixedName = 'use' + name.charAt(0).toUpperCase() + name.slice(1);
      fixCount++;
      return match.replace(name, fixedName);
    }
    return match;
  });

  return { content: fixedContent, fixed: fixCount };
}

/**
 * Fix import ordering in the file content
 */
function fixImportOrdering(content) {
  if (!options.fixImports) {return { content, fixed: 0 };}

  // Extract all import statements
  const importRegex = /^import\s+.*?['"`].*?['"`];?\s*$/gm;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[0]);
  }
  
  if (imports.length <= 1) {
    return { content, fixed: 0 };
  }
  
  // Group imports
  const groupedImports = {};
  importGroups.forEach(group => {
    groupedImports[group.name] = [];
  });
  
  imports.forEach(imp => {
    let placed = false;
    for (const group of importGroups) {
      // Extract the module path from the import statement
      const moduleMatch = imp.match(/from\s+['"`](.*?)['"`]/);
      if (moduleMatch && group.pattern.test(moduleMatch[1])) {
        groupedImports[group.name].push(imp);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      // If it doesn't match any group, put it in "External"
      groupedImports.External.push(imp);
    }
  });
  
  // Sort imports within each group
  Object.keys(groupedImports).forEach(group => {
    groupedImports[group].sort();
  });
  
  // Build the new imports section
  let newImports = '';
  let needsNewline = false;
  
  importGroups.forEach(group => {
    const groupImports = groupedImports[group.name];
    if (groupImports.length > 0) {
      if (needsNewline) {
        newImports += '\n';
      }
      newImports += groupImports.join('\n');
      needsNewline = true;
    }
  });
  
  // Replace all imports in the original content
  const contentWithoutImports = content.replace(new RegExp(importRegex, 'g'), '');
  
  // Find the index where imports end in the original content
  const importEndIndex = imports.reduce((maxIndex, imp) => {
    const idx = content.indexOf(imp) + imp.length;
    return Math.max(maxIndex, idx);
  }, 0);
  
  const beforeImports = content.substring(0, content.indexOf(imports[0]));
  const afterImports = content.substring(importEndIndex);
  
  // Reconstruct the content with sorted imports
  const fixedContent = beforeImports + newImports + afterImports;
  
  return { 
    content: fixedContent, 
    fixed: imports.length > 0 ? 1 : 0 // Count as one fix regardless of number of imports
  };
}

/**
 * Fix formatting issues in the file content
 */
function fixFormatting(content) {
  if (!options.fixFormatting) {return { content, fixed: 0 };}

  let fixedContent = content;
  let fixCount = 0;
  
  // Fix indentation (simplified version)
  const indentationRegex = /^( {1,4})\S/gm;
  fixedContent = fixedContent.replace(indentationRegex, (match, indent) => {
    const spaces = ' '.repeat(formattingRules.indentation);
    if (indent.length !== formattingRules.indentation) {
      fixCount++;
      return spaces + match.trim();
    }
    return match;
  });
  
  // Remove semicolons if they're not needed
  if (formattingRules.noSemicolon) {
    const semicolonRegex = /;(\s*$|\s*\/\/|$)/gm;
    const originalLength = (fixedContent.match(semicolonRegex) || []).length;
    fixedContent = fixedContent.replace(semicolonRegex, '$1');
    const newLength = (fixedContent.match(semicolonRegex) || []).length;
    fixCount += originalLength - newLength;
  }
  
  // Replace double quotes with single quotes
  if (formattingRules.singleQuote) {
    const doubleQuoteRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    const originalLength = (fixedContent.match(doubleQuoteRegex) || []).length;
    fixedContent = fixedContent.replace(doubleQuoteRegex, (match, content) => {
      // Don't replace if the string contains unescaped single quotes
      if (content.includes("'") && !content.includes("\\'")) {
        return match;
      }
      return `'${content}'`;
    });
    const newLength = (fixedContent.match(doubleQuoteRegex) || []).length;
    fixCount += originalLength - newLength;
  }
  
  // Line length fixes would require more complex parsing and aren't included
  // in this simplified example
  
  return { content: fixedContent, fixed: fixCount };
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  const fileResult = {
    file: filePath,
    status: 'skipped',
    fixes: {
      naming: 0,
      imports: 0,
      formatting: 0
    },
    errors: []
  };
  
  try {
    if (options.verbose) {
      console.log(`Processing file: ${filePath}`);
    }
    
    const content = await readFile(filePath, 'utf8');
    let fixedContent = content;
    let hasChanges = false;
    
    // Apply fixes
    if (options.fixNaming) {
      const { content: newContent, fixed } = fixNamingConventions(fixedContent, filePath);
      fixedContent = newContent;
      fileResult.fixes.naming = fixed;
      hasChanges = hasChanges || fixed > 0;
    }
    
    if (options.fixImports) {
      const { content: newContent, fixed } = fixImportOrdering(fixedContent);
      fixedContent = newContent;
      fileResult.fixes.imports = fixed;
      hasChanges = hasChanges || fixed > 0;
    }
    
    if (options.fixFormatting) {
      const { content: newContent, fixed } = fixFormatting(fixedContent);
      fixedContent = newContent;
      fileResult.fixes.formatting = fixed;
      hasChanges = hasChanges || fixed > 0;
    }
    
    // Update file if changes were made
    if (hasChanges) {
      fileResult.status = options.dryRun ? 'would fix' : 'fixed';
      
      if (!options.dryRun) {
        await backupFile(filePath);
        await writeFile(filePath, fixedContent, 'utf8');
        results.filesFixed++;
      }
      
      results.fixesByType.naming += fileResult.fixes.naming;
      results.fixesByType.imports += fileResult.fixes.imports;
      results.fixesByType.formatting += fileResult.fixes.formatting;
    } else {
      fileResult.status = 'clean';
      results.filesSkipped++;
    }
  } catch (error) {
    fileResult.status = 'error';
    fileResult.errors.push(error.message);
    results.filesFailed++;
    
    if (options.verbose) {
      console.error(`Error processing ${filePath}:`, error);
    }
  }
  
  results.fileDetails.push(fileResult);
  return fileResult;
}

/**
 * Generate a report based on the results
 */
function generateReport() {
  if (options.report === 'none') {return null;}
  
  switch (options.report) {
    case 'json':
      return JSON.stringify(results, null, 2);
      
    case 'table':
    default:
      let report = '\n=== Code Style Fixer Report ===\n\n';
      
      report += `Total files: ${results.totalFiles}\n`;
      report += `Files fixed: ${results.filesFixed}\n`;
      report += `Files skipped (already clean): ${results.filesSkipped}\n`;
      report += `Files failed: ${results.filesFailed}\n\n`;
      
      report += 'Fixes by type:\n';
      report += `  Naming conventions: ${results.fixesByType.naming}\n`;
      report += `  Import ordering: ${results.fixesByType.imports}\n`;
      report += `  Formatting: ${results.fixesByType.formatting}\n\n`;
      
      report += 'Files with issues:\n';
      
      const filesWithIssues = results.fileDetails.filter(file => 
        file.status === 'fixed' || file.status === 'would fix' || file.status === 'error'
      );
      
      if (filesWithIssues.length === 0) {
        report += '  No files with issues found.\n';
      } else {
        filesWithIssues.forEach(file => {
          const fixes = file.fixes.naming + file.fixes.imports + file.fixes.formatting;
          if (fixes > 0 || file.status === 'error') {
            report += `  ${file.file} - ${file.status} (${fixes} ${fixes === 1 ? 'fix' : 'fixes'})\n`;
            
            if (file.fixes.naming > 0) {
              report += `    - Naming: ${file.fixes.naming}\n`;
            }
            if (file.fixes.imports > 0) {
              report += `    - Imports: ${file.fixes.imports}\n`;
            }
            if (file.fixes.formatting > 0) {
              report += `    - Formatting: ${file.fixes.formatting}\n`;
            }
            if (file.errors.length > 0) {
              report += `    - Errors: ${file.errors.join(', ')}\n`;
            }
          }
        });
      }
      
      return report;
  }
}

/**
 * Output the report to console or file
 */
function outputReport(report) {
  if (!report) {return;}
  
  if (options.reportFile) {
    fs.writeFileSync(options.reportFile, report);
    console.log(`Report saved to ${options.reportFile}`);
  } else {
    console.log(report);
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`Starting code style fixer in ${options.dryRun ? 'DRY RUN' : 'LIVE'} mode...`);
  
  try {
    const files = await findFiles();
    results.totalFiles = files.length;
    
    console.log(`Found ${files.length} files to process.`);
    
    // Process files in parallel
    await Promise.all(files.map(processFile));
    
    // Generate and output report
    const report = generateReport();
    outputReport(report);
    
    if (options.dryRun) {
      console.log('\nThis was a dry run. No files were modified.');
      console.log(`${results.filesFixed} files would be fixed with ${results.fixesByType.naming + results.fixesByType.imports + results.fixesByType.formatting} total fixes.`);
    } else {
      console.log(`\nFixed ${results.filesFixed} files with ${results.fixesByType.naming + results.fixesByType.imports + results.fixesByType.formatting} total fixes.`);
    }
    
    if (results.filesFailed > 0) {
      console.warn(`Warning: ${results.filesFailed} files had errors during processing.`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Execute the main function
main(); 