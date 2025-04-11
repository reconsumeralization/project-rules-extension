#!/usr/bin/env node

/**
 * Make Scripts Executable
 * 
 * This script sets executable permissions for all Node.js scripts in the project.
 * It's particularly useful when working across different operating systems 
 * to ensure scripts can be executed directly.
 * 
 * Usage:
 *   node scripts/make-scripts-executable.js [options]
 * 
 * Options:
 *   --dir=<path>    Directory to search for scripts (default: ./scripts)
 *   --verbose       Show detailed information
 */

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const util = require('util')
const readdir = util.promisify(fs.readdir)
const stat = util.promisify(fs.stat)

// Platform check
const isWindows = process.platform === 'win32'

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  dir: './scripts',
  verbose: false
}

args.forEach(arg => {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1]
  } else if (arg === '--verbose') {
    options.verbose = true
  }
})

/**
 * Set executable permissions for a file
 */
async function makeExecutable(filePath) {
  return new Promise((resolve, reject) => {
    if (isWindows) {
      // On Windows, we don't need to make files executable, but we can log
      if (options.verbose) {
        console.log(`Skipping chmod on Windows for: ${filePath}`)
      }
      resolve()
    } else {
      // On Unix systems, set executable permission
      exec(`chmod +x "${filePath}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to make ${filePath} executable: ${error.message}`))
          return
        }
        
        if (options.verbose) {
          console.log(`Made executable: ${filePath}`)
        }
        resolve()
      })
    }
  })
}

/**
 * Check if a file is a Node.js script
 */
async function isNodeScript(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8')
    const firstLine = content.split('\n')[0].trim()
    
    // Check for Node.js shebang
    if (firstLine.startsWith('#!/usr/bin/env node') || firstLine.startsWith('#!/usr/bin/node')) {
      return true
    }
    
    // Check file extension as a fallback
    return filePath.endsWith('.js')
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error.message}`)
    return false
  }
}

/**
 * Walk through a directory recursively and process files
 */
async function walkDir(dir) {
  try {
    const files = await readdir(dir)
    
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stats = await stat(filePath)
      
      if (stats.isDirectory()) {
        await walkDir(filePath)
      } else if (stats.isFile() && await isNodeScript(filePath)) {
        await makeExecutable(filePath)
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}: ${error.message}`)
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log(`Making Node.js scripts executable in ${options.dir}...`)
    
    // Check if directory exists
    if (!fs.existsSync(options.dir)) {
      console.error(`Directory not found: ${options.dir}`)
      process.exit(1)
    }
    
    // Process scripts
    await walkDir(options.dir)
    
    console.log('Done making scripts executable')
    
    // Define all specific scripts that should be made executable
    const specificScripts = [
      './scripts/doc-analysis-tool.js',
      './scripts/terminology-checker.js',
      './scripts/taskmaster-storage-cli.js',
      './scripts/taskmaster-init.js',
      './scripts/taskmaster-storage.js'
    ]
    
    for (const script of specificScripts) {
      if (fs.existsSync(script)) {
        await makeExecutable(script)
        console.log(`Made executable: ${script}`)
      } else {
        console.warn(`Script not found: ${script}`)
      }
    }
    
  } catch (error) {
    console.error('Error making scripts executable:', error)
    process.exit(1)
  }
}

// Run the script
main() 