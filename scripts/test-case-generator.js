#!/usr/bin/env node

/**
 * Test Case Generator
 * 
 * Analyzes your codebase and automatically generates test cases
 * based on the code structure and function signatures.
 * 
 * Usage:
 *   node test-case-generator.js [options]
 * 
 * Options:
 *   --src=<dir>           Source directory to analyze (default: ./src)
 *   --output=<dir>        Output directory for test files (default: ./test)
 *   --pattern=<glob>      File pattern to match (default: **//*.{js,ts,tsx})
 *   --framework=<name>    Test framework to use: jest, mocha, vitest (default: jest)
 *   --overwrite           Overwrite existing test files (default: false)
 *   --only-missing        Generate tests only for files without existing tests
 *   --verbose             Display detailed information
 *   --help                Display this help
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  srcDir: './src',
  outputDir: './test',
  pattern: '**/*.{js,ts,tsx}',
  framework: 'jest',
  overwrite: false,
  onlyMissing: true,
  verbose: false
};

// Parse arguments
args.forEach(arg => {
  if (arg === '--help') {
    showHelp();
    process.exit(0);
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--overwrite') {
    options.overwrite = true;
  } else if (arg === '--only-missing') {
    options.onlyMissing = true;
  } else if (arg.startsWith('--src=')) {
    options.srcDir = arg.split('=')[1];
  } else if (arg.startsWith('--output=')) {
    options.outputDir = arg.split('=')[1];
  } else if (arg.startsWith('--pattern=')) {
    options.pattern = arg.split('=')[1];
  } else if (arg.startsWith('--framework=')) {
    options.framework = arg.split('=')[1];
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
    console.log(`Generating test cases for ${options.srcDir}...`);

    // Check if source directory exists
    if (!fs.existsSync(options.srcDir)) {
      console.error(`Error: Source directory not found: ${options.srcDir}`);
      process.exit(1);
    }

    // Find source files
    const sourceFiles = findSourceFiles(options.srcDir, options.pattern);
    if (sourceFiles.length === 0) {
      console.log(`No files found matching pattern: ${options.pattern}`);
      process.exit(0);
    }

    console.log(`Found ${sourceFiles.length} source files.`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
      console.log(`Created output directory: ${options.outputDir}`);
    }

    // Process each source file
    let generatedCount = 0;
    let skippedCount = 0;
    
    for (const sourceFile of sourceFiles) {
      const testFile = getTestFilePath(sourceFile, options);
      
      // Check if test file already exists
      if (fs.existsSync(testFile) && !options.overwrite) {
        if (options.verbose) {
          console.log(`Skipping ${sourceFile} - test already exists at ${testFile}`);
        }
        skippedCount++;
        continue;
      }

      // Generate test file
      if (options.verbose) {
        console.log(`Generating test for ${sourceFile} -> ${testFile}`);
      }
      
      try {
        const code = fs.readFileSync(sourceFile, 'utf8');
        const parsed = parseSource(code, path.extname(sourceFile));
        const testContent = generateTest(parsed, sourceFile, options);
        
        // Create directory if it doesn't exist
        const testDir = path.dirname(testFile);
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        
        // Write test file
        fs.writeFileSync(testFile, testContent);
        generatedCount++;
        
      } catch (err) {
        console.error(`Error generating test for ${sourceFile}:`, err.message);
      }
    }

    console.log(`\nGeneration complete:`);
    console.log(`  - Generated: ${generatedCount} test files`);
    console.log(`  - Skipped: ${skippedCount} files (already have tests)`);

  } catch (error) {
    console.error('Error generating tests:', error);
    process.exit(1);
  }
}

// Find source files matching the pattern
function findSourceFiles(srcDir, pattern) {
  // This is a simplified version - in a real implementation,
  // you would use a library like glob or fast-glob
  
  const files = [];
  
  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          walkDir(fullPath);
        }
      } else if (entry.isFile()) {
        // Check if file matches pattern
        const ext = path.extname(entry.name);
        if (['.js', '.ts', '.tsx'].includes(ext) && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js')) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walkDir(srcDir);
  return files;
}

// Get the test file path for a source file
function getTestFilePath(sourceFile, options) {
  // Replace source directory with test directory
  let testFile = sourceFile.replace(options.srcDir, options.outputDir);
  
  // Add test suffix if not already present
  const ext = path.extname(testFile);
  const basename = path.basename(testFile, ext);
  
  // If a .test suffix doesn't exist, add it
  if (!basename.endsWith('.test') && !basename.endsWith('.spec')) {
    testFile = path.join(path.dirname(testFile), `${basename}.test${ext}`);
  }
  
  return testFile;
}

// Parse source file to extract functions, classes, etc.
function parseSource(code, extension) {
  // This is a simplified implementation - a real implementation would use
  // a proper parser like babel/parser, typescript, or esprima
  
  const functions = [];
  const classes = [];
  const exports = [];
  
  // Extract function names using regex
  // This is a simple approximation - a real impl would use an AST
  const functionRegex = /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)/g;
  let match;
  
  while ((match = functionRegex.exec(code)) !== null) {
    functions.push({
      name: match[1],
      params: extractParams(match[0]),
      async: match[0].includes('async '),
      position: match.index
    });
  }
  
  // Extract classes
  const classRegex = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = classRegex.exec(code)) !== null) {
    classes.push({
      name: match[1],
      methods: extractClassMethods(code, match.index),
      position: match.index
    });
  }
  
  // Extract exports
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|class|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = exportRegex.exec(code)) !== null) {
    exports.push({
      name: match[1],
      default: match[0].includes('default'),
      position: match.index
    });
  }
  
  return { functions, classes, exports, code };
}

// Extract parameters from a function definition
function extractParams(functionDef) {
  // Extract content between parentheses
  const paramMatch = functionDef.match(/\(([^)]*)\)/);
  if (!paramMatch) {
    return [];
  }
  
  // Split by comma and clean up
  return paramMatch[1].split(',')
    .map(param => param.trim())
    .filter(param => param.length > 0)
    .map(param => {
      // Handle TypeScript parameter types
      const nameMatch = param.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::[^=]+)?(?:=.*)?$/);
      return nameMatch ? nameMatch[1] : param;
    });
}

// Extract methods from a class definition
function extractClassMethods(code, classStart) {
  const methods = [];
  
  // Find the class closing brace
  let braceCount = 1;
  let classEnd = classStart;
  
  // Find the first opening brace
  let openingBraceIndex = code.indexOf('{', classStart);
  if (openingBraceIndex === -1) {
    return methods;
  }
  
  // Find the matching closing brace
  for (let i = openingBraceIndex + 1; i < code.length; i++) {
    if (code[i] === '{') {
      braceCount++;
    }
    if (code[i] === '}') {
      braceCount--;
    }
    
    if (braceCount === 0) {
      classEnd = i;
      break;
    }
  }
  
  // Get class body
  const classBody = code.substring(openingBraceIndex + 1, classEnd);
  
  // Extract methods
  const methodRegex = /(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)/g;
  let match;
  
  while ((match = methodRegex.exec(classBody)) !== null) {
    // Skip constructor
    if (match[1] !== 'constructor') {
      methods.push({
        name: match[1],
        params: extractParams(match[0]),
        async: match[0].includes('async')
      });
    }
  }
  
  return methods;
}

// Generate test content
function generateTest(parsed, sourceFile, options) {
  const framework = options.framework.toLowerCase();
  const relativePath = path.relative(path.dirname(getTestFilePath(sourceFile, options)), sourceFile);
  const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  
  // Remove extension for import path
  const importPathNoExt = importPath.replace(/\.[^/.]+$/, '');
  
  let testContent = '';
  
  // Add imports based on framework
  switch (framework) {
    case 'jest':
      testContent += `import { describe, test, expect } from '@jest/globals';\n`;
      break;
    case 'mocha':
      testContent += `import { describe, it } from 'mocha';\n`;
      testContent += `import { expect } from 'chai';\n`;
      break;
    case 'vitest':
      testContent += `import { describe, it, expect } from 'vitest';\n`;
      break;
  }
  
  // Add import for the source file
  // If we have named exports, import them individually
  const hasNamedExports = parsed.exports.some(exp => !exp.default);
  const hasDefaultExport = parsed.exports.some(exp => exp.default);
  
  if (hasDefaultExport && hasNamedExports) {
    const defaultExport = parsed.exports.find(exp => exp.default);
    const namedExports = parsed.exports.filter(exp => !exp.default);
    testContent += `import ${defaultExport.name}, { ${namedExports.map(e => e.name).join(', ')} } from '${importPathNoExt}';\n\n`;
  } else if (hasDefaultExport) {
    const defaultExport = parsed.exports.find(exp => exp.default);
    testContent += `import ${defaultExport.name} from '${importPathNoExt}';\n\n`;
  } else if (hasNamedExports) {
    testContent += `import { ${parsed.exports.map(e => e.name).join(', ')} } from '${importPathNoExt}';\n\n`;
  } else {
    // If no exports found, create a default import with the filename (capitalized)
    const filename = path.basename(sourceFile, path.extname(sourceFile));
    const capitalizedName = filename.charAt(0).toUpperCase() + filename.slice(1);
    testContent += `import ${capitalizedName} from '${importPathNoExt}';\n\n`;
  }
  
  // Generate tests for exported functions and classes
  if (parsed.exports.length > 0) {
    for (const exp of parsed.exports) {
      // Find the corresponding function or class
      const func = parsed.functions.find(f => f.name === exp.name);
      const cls = parsed.classes.find(c => c.name === exp.name);
      
      if (func) {
        testContent += generateFunctionTest(func, exp, options);
      } else if (cls) {
        testContent += generateClassTest(cls, exp, options);
      }
    }
  } else {
    // Generate tests for all functions and classes if no exports found
    for (const func of parsed.functions) {
      testContent += generateFunctionTest(func, null, options);
    }
    
    for (const cls of parsed.classes) {
      testContent += generateClassTest(cls, null, options);
    }
  }
  
  return testContent;
}

// Generate test for a function
function generateFunctionTest(func, exportInfo, options) {
  const framework = options.framework.toLowerCase();
  const testFn = framework === 'jest' ? 'test' : 'it';
  
  let test = `describe('${func.name}', () => {\n`;
  
  // Basic test case
  test += `  ${testFn}('should work correctly', () => {\n`;
  
  // Generate test parameter values
  const params = func.params.map(generateTestValue).join(', ');
  
  // Generate the function call
  test += `    // TODO: Add proper test values\n`;
  test += `    const result = ${func.name}(${params});\n`;
  test += `    // TODO: Add appropriate assertions\n`;
  
  if (framework === 'jest' || framework === 'vitest') {
    test += `    expect(result).toBeDefined();\n`;
  } else {
    test += `    expect(result).to.exist;\n`;
  }
  
  test += `  });\n\n`;
  
  // Add TODO test cases
  test += `  // TODO: Add more test cases for ${func.name}\n`;
  test += `  // ${testFn}.todo('should handle edge cases');\n`;
  test += `  // ${testFn}.todo('should throw errors for invalid inputs');\n`;
  
  test += `});\n\n`;
  
  return test;
}

// Generate test for a class
function generateClassTest(cls, exportInfo, options) {
  const framework = options.framework.toLowerCase();
  const testFn = framework === 'jest' ? 'test' : 'it';
  
  let test = `describe('${cls.name}', () => {\n`;
  
  // Instance creation
  test += `  ${testFn}('should create an instance', () => {\n`;
  test += `    // TODO: Add proper constructor parameters\n`;
  test += `    const instance = new ${cls.name}();\n`;
  
  if (framework === 'jest' || framework === 'vitest') {
    test += `    expect(instance).toBeInstanceOf(${cls.name});\n`;
  } else {
    test += `    expect(instance).to.be.an.instanceof(${cls.name});\n`;
  }
  
  test += `  });\n\n`;
  
  // Test for each method
  for (const method of cls.methods) {
    test += `  describe('#${method.name}', () => {\n`;
    test += `    ${testFn}('should work correctly', () => {\n`;
    test += `      // TODO: Add proper constructor parameters\n`;
    test += `      const instance = new ${cls.name}();\n`;
    
    // Generate test parameter values
    const params = method.params.map(generateTestValue).join(', ');
    
    // Generate the method call
    test += `      // TODO: Add proper test values\n`;
    test += `      const result = instance.${method.name}(${params});\n`;
    test += `      // TODO: Add appropriate assertions\n`;
    
    if (framework === 'jest' || framework === 'vitest') {
      test += `      expect(result).toBeDefined();\n`;
    } else {
      test += `      expect(result).to.exist;\n`;
    }
    
    test += `    });\n`;
    test += `  });\n\n`;
  }
  
  test += `});\n\n`;
  
  return test;
}

// Generate a test value for a parameter
function generateTestValue(param) {
  // Very basic placeholder for parameter values
  if (param.includes('callback')) {
    return 'jest.fn()';
  }
  if (param.includes('id')) {
    return '123';
  }
  if (param.includes('name')) {
    return '"testName"';
  }
  if (param.includes('options')) {
    return '{}';
  }
  if (param.includes('config')) {
    return '{}';
  }
  
  return 'undefined';
}

// Run the main function
main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
}); 