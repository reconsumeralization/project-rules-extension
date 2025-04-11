#!/usr/bin/env node

/**
 * User Proxy Form Interface
 * 
 * This script provides a programmatic interface for interacting with documentation fixing tools.
 * It allows automating form interactions by providing inputs programmatically rather than through the CLI.
 * 
 * Usage:
 * --auto-fix-all         Automatically fix all terminology issues
 * --fix=file1,file2      Specify files to fix (comma-separated)
 * --interactive          Run in UI-driven mode
 * --module=moduleName    Specify module to focus on (e.g., taskmaster)
 * --output=path          Path for generated reports
 * --verbose              Show detailed output
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  autoFixAll: args.includes('--auto-fix-all'),
  interactive: args.includes('--interactive'),
  verbose: args.includes('--verbose'),
  module: args.find(arg => arg.startsWith('--module='))?.split('=')[1] || null,
  output: args.find(arg => arg.startsWith('--output='))?.split('=')[1] || './reports',
  fix: args.find(arg => arg.startsWith('--fix='))?.split('=')[1]?.split(',') || null
}

// Create output directory if it doesn't exist
if (!fs.existsSync(options.output)) {
  fs.mkdirSync(options.output, { recursive: true })
}

/**
 * Proxy for terminology fixing operations
 */
class TerminologyFixerProxy {
  constructor(options = {}) {
    this.options = options
    this.scriptPath = path.join(__dirname, 'terminology-fixer.js')
  }

  check() {
    console.log('Running terminology check...')
    let cmd = `node ${this.scriptPath} --check`
    
    if (this.options.module) {
      cmd += ` --module=${this.options.module}`
    }
    
    try {
      const result = execSync(cmd, { encoding: 'utf8' })
      console.log(result)
      return result
    } catch (error) {
      console.error('Error during terminology check:', error.message)
      return null
    }
  }

  fixAll() {
    console.log('Automatically fixing all terminology issues...')
    let cmd = `node ${this.scriptPath} --fix-all`
    
    if (this.options.module) {
      cmd += ` --module=${this.options.module}`
    }
    
    try {
      const result = execSync(cmd, { encoding: 'utf8' })
      console.log(result)
      return result
    } catch (error) {
      console.error('Error during auto-fix:', error.message)
      return null
    }
  }

  fixFiles(files) {
    if (!files || files.length === 0) {
      console.error('No files specified for fixing')
      return null
    }

    console.log(`Fixing terminology in specified files: ${files.join(', ')}`)
    let cmd = `node ${this.scriptPath} --fix=${files.join(',')}`
    
    if (this.options.module) {
      cmd += ` --module=${this.options.module}`
    }
    
    try {
      const result = execSync(cmd, { encoding: 'utf8' })
      console.log(result)
      return result
    } catch (error) {
      console.error('Error during file fix:', error.message)
      return null
    }
  }

  async interactiveFix(automatedResponses = {}) {
    console.log('Starting interactive terminology fixer with automated responses...')
    
    // Define default automated responses
    const defaultResponses = {
      'Fix this issue? (y/n)': 'y',
      'Apply all similar fixes in this file? (y/n)': 'y',
      'Continue to next file? (y/n)': 'y',
      'Save changes? (y/n)': 'y'
    }
    
    // Merge with provided responses
    const responses = { ...defaultResponses, ...automatedResponses }
    
    return new Promise((resolve, reject) => {
      let cmd = `node ${this.scriptPath} --interactive`
      
      if (this.options.module) {
        cmd += ` --module=${this.options.module}`
      }
      
      const process = spawn('node', [this.scriptPath, '--interactive'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      // Create interface to handle input/output
      const rl = readline.createInterface({
        input: process.stdout,
        output: process.stdin,
        terminal: false
      })
      
      rl.on('line', (line) => {
        console.log(`> ${line}`)
        
        // Check if the line matches any of our automated responses
        for (const [prompt, response] of Object.entries(responses)) {
          if (line.includes(prompt)) {
            console.log(`Automated response: ${response}`)
            process.stdin.write(`${response}\n`)
            break
          }
        }
      })
      
      process.on('close', (code) => {
        rl.close()
        if (code === 0) {
          console.log('Interactive fix completed successfully')
          resolve(true)
        } else {
          console.error(`Interactive fix failed with code ${code}`)
          reject(new Error(`Process exited with code ${code}`))
        }
      })
      
      process.stderr.on('data', (data) => {
        console.error(`ERROR: ${data.toString()}`)
      })
    })
  }
}

/**
 * Proxy for documentation analysis operations
 */
class DocAnalyzerProxy {
  constructor(options = {}) {
    this.options = options
    this.scriptPath = path.join(__dirname, 'doc-code-analyzer.js')
  }

  analyze() {
    console.log('Running documentation analysis...')
    let cmd = `node ${this.scriptPath} --analyze`
    
    if (this.options.module) {
      cmd += ` --module=${this.options.module}`
    }
    
    try {
      const result = execSync(cmd, { encoding: 'utf8' })
      if (this.options.verbose) {
        console.log(result)
      } else {
        console.log('Documentation analysis completed')
      }
      return result
    } catch (error) {
      console.error('Error during documentation analysis:', error.message)
      return null
    }
  }

  generateReport() {
    console.log('Generating documentation analysis report...')
    const outputPath = path.join(this.options.output, 'doc-analysis-report.md')
    let cmd = `node ${this.scriptPath} --report --output=${outputPath}`
    
    if (this.options.module) {
      cmd += ` --module=${this.options.module}`
    }
    
    try {
      execSync(cmd)
      console.log(`Report generated at ${outputPath}`)
      return outputPath
    } catch (error) {
      console.error('Error generating report:', error.message)
      return null
    }
  }
}

/**
 * Proxy for interactive documentation fixing
 */
class InteractiveFixerProxy {
  constructor(options = {}) {
    this.options = options
    this.scriptPath = path.join(__dirname, 'interactive-docs-fixer.js')
  }

  async start(automatedSequence = []) {
    console.log('Starting interactive documentation fixer...')
    
    return new Promise((resolve, reject) => {
      let args = ['--interactive']
      
      if (this.options.module) {
        args.push(`--module=${this.options.module}`)
      }
      
      const process = spawn('node', [this.scriptPath, ...args], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      // Create interface to handle input/output
      const rl = readline.createInterface({
        input: process.stdout,
        output: process.stdin,
        terminal: false
      })
      
      let currentStep = 0
      
      rl.on('line', (line) => {
        console.log(`> ${line}`)
        
        // If we have automated responses, use them in sequence
        if (automatedSequence && automatedSequence.length > currentStep) {
          const response = automatedSequence[currentStep]
          console.log(`Automated response [${currentStep}]: ${response}`)
          process.stdin.write(`${response}\n`)
          currentStep++
        }
      })
      
      process.on('close', (code) => {
        rl.close()
        if (code === 0) {
          console.log('Interactive docs fixing completed successfully')
          resolve(true)
        } else {
          console.error(`Interactive docs fixing failed with code ${code}`)
          reject(new Error(`Process exited with code ${code}`))
        }
      })
      
      process.stderr.on('data', (data) => {
        console.error(`ERROR: ${data.toString()}`)
      })
    })
  }
}

/**
 * Web-based user interface (placeholder for future implementation)
 */
class WebInterface {
  constructor(options = {}) {
    this.options = options
    this.port = options.port || 3030
  }

  start() {
    console.log(`
    ┌───────────────────────────────────────────────────┐
    │                                                   │
    │   Web interface not implemented yet               │
    │   This would launch a UI for interactive fixing   │
    │   on http://localhost:${this.port}                   │
    │                                                   │
    └───────────────────────────────────────────────────┘
    `)
  }
}

/**
 * Main function to run based on provided options
 */
async function main() {
  console.log('Starting User Proxy Form Interface')
  console.log('Options:', options)

  const terminologyFixer = new TerminologyFixerProxy(options)
  const docAnalyzer = new DocAnalyzerProxy(options)
  const interactiveFixer = new InteractiveFixerProxy(options)

  try {
    // Run in fully automated mode
    if (options.autoFixAll) {
      // First run analysis
      await docAnalyzer.analyze()
      
      // Then check and fix terminology issues
      await terminologyFixer.check()
      await terminologyFixer.fixAll()
      
      // Generate final report
      const reportPath = await docAnalyzer.generateReport()
      
      console.log('===========================================')
      console.log('✓ Documentation auto-fix completed successfully')
      console.log(`✓ Report generated at: ${reportPath}`)
    }
    // Fix specific files
    else if (options.fix) {
      await terminologyFixer.fixFiles(options.fix)
    }
    // Run in interactive mode
    else if (options.interactive) {
      if (options.webUi) {
        const webInterface = new WebInterface(options)
        webInterface.start()
      } else {
        // Run interactive mode with some automated responses
        await interactiveFixer.start([
          '1', // Select option 1 (fix terminology)
          'y', // Yes to first prompt
          'y', // Yes to second prompt
          'q'  // Quit when done
        ])
      }
    }
    // Default behavior: just run a check
    else {
      await docAnalyzer.analyze()
      await terminologyFixer.check()
      console.log('\nRun with --auto-fix-all to automatically fix all issues')
      console.log('Run with --fix=file1,file2 to fix specific files')
      console.log('Run with --interactive for guided fixing')
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
}) 