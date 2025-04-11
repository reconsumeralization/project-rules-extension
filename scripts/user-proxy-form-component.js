#!/usr/bin/env node

/**
 * User Proxy Form Component
 * 
 * This script provides a form-based interface for interacting with the
 * documentation tools and taskmaster workflows. It can render forms in different
 * modes (CLI, web, React) and export/import form definitions.
 * 
 * Usage:
 *   npm run proxy-form -- [options]
 * 
 * Options:
 *   --render-mode=<mode>    Specify rendering mode: cli (default), web, react
 *   --export=<path>         Export form definition to specified JSON file
 *   --config=<path>         Use custom configuration file
 *   --interactive           Run in interactive mode with prompts
 *   --form=<form-name>      Specify which form to render (default: 'main')
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

// Default configuration
const DEFAULT_CONFIG = {
  renderMode: 'cli',
  exportPath: null,
  configPath: null,
  interactive: false,
  formName: 'main',
  forms: {
    main: {
      title: 'Documentation Tools',
      description: 'Select a tool to run:',
      fields: [
        {
          type: 'select',
          name: 'tool',
          label: 'Tool',
          options: [
            { value: 'doc-analysis', label: 'Documentation Analysis' },
            { value: 'terminology', label: 'Terminology Checker' },
            { value: 'taskmaster', label: 'Taskmaster' },
            { value: 'fix-docs', label: 'Interactive Docs Fixer' }
          ],
          required: true
        }
      ],
      actions: [
        { label: 'Run', action: 'run', primary: true },
        { label: 'Cancel', action: 'cancel' }
      ]
    },
    'doc-analysis': {
      title: 'Documentation Analysis',
      description: 'Analyze documentation and code for inconsistencies',
      fields: [
        {
          type: 'select',
          name: 'module',
          label: 'Module',
          options: [
            { value: 'all', label: 'All Modules' },
            { value: 'taskmaster', label: 'Taskmaster' }
          ],
          default: 'all'
        },
        {
          type: 'select',
          name: 'reportFormat',
          label: 'Report Format',
          options: [
            { value: 'console', label: 'Console Output' },
            { value: 'markdown', label: 'Markdown Report' },
            { value: 'json', label: 'JSON Data' }
          ],
          default: 'console'
        },
        {
          type: 'checkbox',
          name: 'options',
          label: 'Options',
          options: [
            { value: 'interactive', label: 'Interactive Mode' },
            { value: 'fix-terminology', label: 'Fix Terminology Issues' }
          ]
        }
      ],
      actions: [
        { label: 'Run Analysis', action: 'run-analysis', primary: true },
        { label: 'Back', action: 'back' }
      ]
    },
    'terminology': {
      title: 'Terminology Checker',
      description: 'Check and fix terminology inconsistencies',
      fields: [
        {
          type: 'select',
          name: 'action',
          label: 'Action',
          options: [
            { value: 'check', label: 'Check Only' },
            { value: 'fix', label: 'Fix Issues' },
            { value: 'dry-run', label: 'Dry Run (Show Changes)' },
            { value: 'interactive', label: 'Interactive Mode' }
          ],
          default: 'check'
        }
      ],
      actions: [
        { label: 'Run Checker', action: 'run-terminology', primary: true },
        { label: 'Back', action: 'back' }
      ]
    },
    'taskmaster': {
      title: 'Taskmaster',
      description: 'Manage development tasks and workflows',
      fields: [
        {
          type: 'select',
          name: 'version',
          label: 'Version',
          options: [
            { value: 'standard', label: 'Standard Workflow' },
            { value: 'enhanced', label: 'Enhanced Workflow' },
            { value: 'autonomous', label: 'Autonomous Mode' }
          ],
          default: 'enhanced'
        },
        {
          type: 'select',
          name: 'action',
          label: 'Action',
          options: [
            { value: 'default', label: 'Interactive Mode' },
            { value: 'auto', label: 'Auto Mode' },
            { value: 'complete', label: 'Complete Current Task' },
            { value: 'dashboard', label: 'Show Dashboard' },
            { value: 'tradeoff', label: 'Tradeoff Analysis' }
          ],
          default: 'default'
        },
        {
          type: 'select',
          name: 'phase',
          label: 'Development Phase',
          options: [
            { value: 'none', label: 'Not Specified' },
            { value: 'planning', label: 'Planning' },
            { value: 'design', label: 'Design' },
            { value: 'implementation', label: 'Implementation' },
            { value: 'testing', label: 'Testing' },
            { value: 'review', label: 'Review' },
            { value: 'deployment', label: 'Deployment' }
          ],
          default: 'none',
          showIf: { field: 'version', value: 'enhanced' }
        },
        {
          type: 'checkbox',
          name: 'options',
          label: 'Options',
          options: [
            { value: 'mcp-integrate', label: 'MCP Server Integration' },
            { value: 'progress-report', label: 'Generate Progress Report' }
          ]
        },
        {
          type: 'text',
          name: 'taskId',
          label: 'Task ID (optional)',
          placeholder: 'e.g., task001'
        }
      ],
      actions: [
        { label: 'Run Taskmaster', action: 'run-taskmaster', primary: true },
        { label: 'Back', action: 'back' }
      ]
    }
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  args.forEach(arg => {
    if (arg.startsWith('--render-mode=')) {
      config.renderMode = arg.split('=')[1];
    } else if (arg.startsWith('--export=')) {
      config.exportPath = arg.split('=')[1];
    } else if (arg.startsWith('--config=')) {
      config.configPath = arg.split('=')[1];
    } else if (arg.startsWith('--form=')) {
      config.formName = arg.split('=')[1];
    } else if (arg === '--interactive') {
      config.interactive = true;
    }
  });
  
  return config;
}

// Load configuration from file if specified
function loadConfig(config) {
  if (config.configPath && fs.existsSync(config.configPath)) {
    try {
      const customConfig = JSON.parse(fs.readFileSync(config.configPath, 'utf8'));
      return { ...config, ...customConfig };
    } catch (error) {
      console.error(`Error loading config file: ${error.message}`);
    }
  }
  return config;
}

// Export form definition to file
function exportFormDefinition(config) {
  if (config.exportPath) {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(config.exportPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const formDefinition = {
        forms: config.forms
      };
      
      fs.writeFileSync(config.exportPath, JSON.stringify(formDefinition, null, 2), 'utf8');
      console.log(`Form definition exported to ${config.exportPath}`);
      return true;
    } catch (error) {
      console.error(`Error exporting form definition: ${error.message}`);
    }
  }
  return false;
}

// CLI Form Renderer
class CliFormRenderer {
  constructor(config) {
    this.config = config;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.formData = {};
  }
  
  async render(formName) {
    const form = this.config.forms[formName];
    if (!form) {
      console.error(`Form "${formName}" not found in configuration`);
      this.rl.close();
      return null;
    }
    
    console.log(`\n${form.title}`);
    console.log('='.repeat(form.title.length));
    console.log(`${form.description}\n`);
    
    // Collect field values
    for (const field of form.fields) {
      // Check if field should be shown based on conditions
      if (field.showIf && this.formData[field.showIf.field] !== field.showIf.value) {
        continue;
      }
      
      let value;
      
      switch (field.type) {
        case 'text':
          value = await this.promptText(field);
          break;
        case 'select':
          value = await this.promptSelect(field);
          break;
        case 'checkbox':
          value = await this.promptCheckbox(field);
          break;
        default:
          console.log(`Unsupported field type: ${field.type}`);
          continue;
      }
      
      this.formData[field.name] = value;
    }
    
    // Handle actions
    const action = await this.promptAction(form.actions);
    
    this.rl.close();
    return { formData: this.formData, action };
  }
  
  async promptText(field) {
    return new Promise(resolve => {
      const defaultText = field.default ? ` (${field.default})` : '';
      const placeholder = field.placeholder ? ` e.g. ${field.placeholder}` : '';
      
      this.rl.question(`${field.label}${placeholder}${defaultText}: `, answer => {
        const value = answer.trim() || field.default || '';
        resolve(value);
      });
    });
  }
  
  async promptSelect(field) {
    return new Promise(resolve => {
      console.log(`${field.label}:`);
      
      field.options.forEach((option, index) => {
        const defaultMark = option.value === field.default ? ' (default)' : '';
        console.log(`  ${index + 1}. ${option.label}${defaultMark}`);
      });
      
      this.rl.question('Select an option (number): ', answer => {
        const index = parseInt(answer, 10) - 1;
        
        if (isNaN(index) || index < 0 || index >= field.options.length) {
          // Invalid input or empty - use default if available
          const defaultOption = field.options.find(o => o.value === field.default);
          resolve(defaultOption ? defaultOption.value : field.options[0].value);
        } else {
          resolve(field.options[index].value);
        }
      });
    });
  }
  
  async promptCheckbox(field) {
    return new Promise(resolve => {
      console.log(`${field.label}:`);
      
      field.options.forEach((option, index) => {
        console.log(`  ${index + 1}. ${option.label}`);
      });
      
      this.rl.question('Select options (comma-separated numbers, or "all"): ', answer => {
        if (answer.trim().toLowerCase() === 'all') {
          resolve(field.options.map(option => option.value));
        } else {
          const selectedIndices = answer.split(',')
            .map(num => parseInt(num.trim(), 10) - 1)
            .filter(index => !isNaN(index) && index >= 0 && index < field.options.length);
          
          const selectedValues = selectedIndices.map(index => field.options[index].value);
          resolve(selectedValues);
        }
      });
    });
  }
  
  async promptAction(actions) {
    return new Promise(resolve => {
      console.log('\nActions:');
      actions.forEach((action, index) => {
        const primary = action.primary ? ' (primary)' : '';
        console.log(`  ${index + 1}. ${action.label}${primary}`);
      });
      
      this.rl.question('Select an action (number): ', answer => {
        const index = parseInt(answer, 10) - 1;
        
        if (isNaN(index) || index < 0 || index >= actions.length) {
          // Invalid input - use primary action or first action
          const primaryAction = actions.find(a => a.primary);
          resolve(primaryAction ? primaryAction.action : actions[0].action);
        } else {
          resolve(actions[index].action);
        }
      });
    });
  }
}

// Execute command based on form data
function executeCommand(formData, actionType, formName) {
  let command = '';
  const args = [];
  
  switch (formName) {
    case 'doc-analysis':
      command = 'npm';
      args.push('run', 'doc-analysis');
      
      if (formData.module && formData.module !== 'all') {
        args[1] = `doc-analysis:${formData.module}`;
      }
      
      if (formData.reportFormat === 'markdown') {
        args.push('--', '--report-format=markdown');
      } else if (formData.reportFormat === 'json') {
        args.push('--', '--report-format=json');
      }
      
      if (formData.options && formData.options.includes('interactive')) {
        args[1] = 'doc-analysis:interactive';
        
        if (formData.module && formData.module !== 'all') {
          args[1] = `doc-analysis:interactive:${formData.module}`;
        }
      }
      
      if (formData.options && formData.options.includes('fix-terminology')) {
        args.push('--', '--fix-terminology');
      }
      break;
    
    case 'terminology':
      command = 'npm';
      args.push('run', `terminology:${formData.action}`);
      break;
    
    case 'taskmaster':
      { command = 'npm';
      const version = formData.version || 'enhanced';
      let scriptName = 'taskmaster';
      
      if (version !== 'standard') {
        scriptName = `taskmaster:${version}`;
      }
      
      args.push('run', scriptName);
      
      // Handle action
      if (formData.action && formData.action !== 'default') {
        if (version === 'standard') {
          if (formData.action === 'auto') {
            args[1] = 'taskmaster:auto';
          } else if (formData.action === 'complete') {
            args[1] = 'taskmaster:complete';
          } else if (formData.action === 'dashboard') {
            args[1] = 'taskmaster:dashboard';
          }
        } else if (version === 'enhanced') {
          if (formData.action === 'auto') {
            args.push('--', '--auto');
          } else if (formData.action === 'complete') {
            args.push('--', '--complete-current');
          } else if (formData.action === 'dashboard') {
            args.push('--', '--dashboard');
          } else if (formData.action === 'tradeoff') {
            args[1] = 'taskmaster:tradeoff';
          }
        } else if (version === 'autonomous') {
          if (formData.action === 'auto') {
            // Autonomous is already auto
          } else if (formData.action === 'complete') {
            // No direct equivalent for autonomous
          } else if (formData.action === 'dashboard') {
            args[1] = 'taskmaster:autonomous-dashboard';
          }
        }
      }
      
      // Handle phase for enhanced version
      if (version === 'enhanced' && formData.phase && formData.phase !== 'none') {
        args[1] = `taskmaster:phase-${formData.phase}`;
      }
      
      // Handle options
      if (formData.options) {
        if (formData.options.includes('mcp-integrate')) {
          if (version === 'enhanced') {
            args.push('--', '--mcp-integrate');
          } else if (version === 'autonomous') {
            args[1] = 'taskmaster:autonomous-mcp';
          }
        }
        
        if (formData.options.includes('progress-report') && version === 'enhanced') {
          args.push('--', '--progress-report');
        }
      }
      
      // Handle task ID
      if (formData.taskId && formData.taskId.trim()) {
        args.push('--', `--task=${formData.taskId.trim()}`);
      }
      break; }
    
    case 'fix-docs':
      command = 'npm';
      args.push('run', 'fix-docs:interactive');
      break;
      
    default:
      if (formName === 'main' && formData.tool) {
        // For main form, just redirect to the selected tool
        return executeCommand(formData, actionType, formData.tool);
      }
      console.error(`Unknown form: ${formName}`);
      return;
  }
  
  console.log(`\nExecuting: ${command} ${args.join(' ')}\n`);
  
  const childProcess = spawn(command, args, { 
    stdio: 'inherit',
    shell: true
  });
  
  childProcess.on('error', (error) => {
    console.error(`Error executing command: ${error.message}`);
  });
  
  childProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Command exited with code ${code}`);
    }
  });
}

// Main function
async function main() {
  let config = parseArgs();
  config = loadConfig(config);
  
  // Export form definition if requested
  if (exportFormDefinition(config)) {
    return;
  }
  
  // Render the form based on the configured mode
  switch (config.renderMode) {
    case 'cli':
      { const renderer = new CliFormRenderer(config);
      const result = await renderer.render(config.formName);
      
      if (result && result.action && !result.action.startsWith('back') && !result.action.startsWith('cancel')) {
        executeCommand(result.formData, result.action, config.formName);
      }
      break; }
    
    case 'web':
      console.log('Web rendering mode not implemented yet. Use --render-mode=cli for now.');
      break;
    
    case 'react':
      console.log('React rendering mode not implemented yet. Use --render-mode=cli for now.');
      break;
    
    default:
      console.error(`Unknown render mode: ${config.renderMode}`);
  }
}

// Run the main function
main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}); 