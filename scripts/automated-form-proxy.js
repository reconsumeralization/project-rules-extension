#!/usr/bin/env node

/**
 * Automated Form Proxy
 * 
 * This script provides automated interactions with the form-based tools defined in user-proxy-form-component.js.
 * Instead of requiring user input for each field, this proxy can automatically fill forms with predefined values
 * and execute the resulting commands.
 * 
 * Usage:
 *   node scripts/automated-form-proxy.js --form=<formName> --config=<configFile> [--dry-run] [--verbose]
 * 
 * Options:
 *   --form        Form to automate (doc-analysis, terminology, taskmaster, fix-docs, main)
 *   --config      Path to JSON configuration file with predefined form answers
 *   --preset      Name of a built-in preset (alternative to --config)
 *   --dry-run     Show commands that would be executed without actually running them
 *   --verbose     Show detailed logs about form filling process
 *   --export      Export a template configuration based on the form structure
 *   
 * Example configuration file:
 * {
 *   "doc-analysis": {
 *     "module": "taskmaster",
 *     "reportFormat": "markdown",
 *     "options": ["interactive", "fix-terminology"],
 *     "action": "run"
 *   },
 *   "taskmaster": {
 *     "version": "enhanced",
 *     "action": "tradeoff",
 *     "phase": "implementation",
 *     "options": ["mcp-integrate", "progress-report"],
 *     "taskId": "doc001",
 *     "action": "run"
 *   }
 * }
 * 
 * Built-in presets:
 * - doc-analysis-taskmaster
 * - fix-terminology-all
 * - taskmaster-tradeoff
 * - taskmaster-complete-current
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Define built-in presets
const PRESETS = {
  'doc-analysis-taskmaster': {
    'doc-analysis': {
      module: 'taskmaster',
      reportFormat: 'markdown',
      options: [],
      submitAction: 'run'
    }
  },
  'fix-terminology-all': {
    'terminology': {
      action: 'check',
      options: ['auto-fix'],
      submitAction: 'run'
    }
  },
  'taskmaster-tradeoff': {
    'taskmaster': {
      version: 'enhanced',
      action: 'tradeoff',
      phase: 'none',
      options: ['mcp-integrate'],
      taskId: '',
      submitAction: 'run'
    }
  },
  'taskmaster-complete-current': {
    'taskmaster': {
      version: 'enhanced',
      action: 'complete',
      phase: 'none',
      options: [],
      taskId: '',
      submitAction: 'run'
    }
  }
};

// Load form definitions from original script
function loadFormDefinitions() {
  // Default form definitions from user-proxy-form-component.js
  return {
    'main': {
      title: 'Documentation & Taskmaster Tools',
      description: 'Select a tool to launch',
      fields: [
        {
          name: 'tool',
          label: 'Select Tool',
          type: 'select',
          options: [
            { label: 'Documentation Analysis', value: 'doc-analysis' },
            { label: 'Terminology Checker', value: 'terminology' },
            { label: 'Taskmaster', value: 'taskmaster' },
            { label: 'Fix Documentation', value: 'fix-docs' }
          ],
          default: 'doc-analysis'
        }
      ],
      actions: [
        { label: 'Launch Tool', action: 'run', primary: true },
        { label: 'Cancel', action: 'cancel' }
      ]
    },
    'doc-analysis': {
      title: 'Documentation Analysis Tool',
      description: 'Analyze documentation for consistency and issues',
      fields: [
        {
          name: 'module',
          label: 'Module to analyze',
          type: 'select',
          options: [
            { label: 'All modules', value: 'all' },
            { label: 'Taskmaster', value: 'taskmaster' },
            { label: 'MCP Integration', value: 'mcp' },
            { label: 'Core System', value: 'core' }
          ],
          default: 'all'
        },
        {
          name: 'reportFormat',
          label: 'Report format',
          type: 'select',
          options: [
            { label: 'Console output', value: 'console' },
            { label: 'Markdown report', value: 'markdown' },
            { label: 'JSON data', value: 'json' }
          ],
          default: 'console'
        },
        {
          name: 'options',
          label: 'Additional options',
          type: 'checkbox',
          options: [
            { label: 'Interactive mode', value: 'interactive' },
            { label: 'Fix terminology issues', value: 'fix-terminology' }
          ]
        }
      ],
      actions: [
        { label: 'Run Analysis', action: 'run', primary: true },
        { label: 'Back', action: 'back-to-main' },
        { label: 'Cancel', action: 'cancel' }
      ]
    },
    'terminology': {
      title: 'Terminology Checker',
      description: 'Check and fix terminology inconsistencies',
      fields: [
        {
          name: 'action',
          label: 'Action',
          type: 'select',
          options: [
            { label: 'Check terminology', value: 'check' },
            { label: 'Add new term', value: 'add' },
            { label: 'Update existing term', value: 'update' },
            { label: 'Remove term', value: 'remove' }
          ],
          default: 'check'
        }
      ],
      actions: [
        { label: 'Run', action: 'run', primary: true },
        { label: 'Back', action: 'back-to-main' },
        { label: 'Cancel', action: 'cancel' }
      ]
    },
    'taskmaster': {
      title: 'Taskmaster',
      description: 'Task management and workflow tool',
      fields: [
        {
          name: 'version',
          label: 'Taskmaster version',
          type: 'select',
          options: [
            { label: 'Standard', value: 'standard' },
            { label: 'Enhanced', value: 'enhanced' },
            { label: 'Autonomous', value: 'autonomous' }
          ],
          default: 'enhanced'
        },
        {
          name: 'action',
          label: 'Action',
          type: 'select',
          options: [
            { label: 'Default/Interactive', value: 'default' },
            { label: 'Automatic mode', value: 'auto' },
            { label: 'Complete current task', value: 'complete' },
            { label: 'Show dashboard', value: 'dashboard' },
            { label: 'Tradeoff analysis', value: 'tradeoff' }
          ],
          default: 'default'
        },
        {
          name: 'phase',
          label: 'Development phase',
          type: 'select',
          options: [
            { label: 'None/Default', value: 'none' },
            { label: 'Planning', value: 'planning' },
            { label: 'Design', value: 'design' },
            { label: 'Implementation', value: 'implementation' },
            { label: 'Testing', value: 'testing' },
            { label: 'Review', value: 'review' },
            { label: 'Deployment', value: 'deployment' }
          ],
          default: 'none',
          showIf: { field: 'version', value: 'enhanced' }
        },
        {
          name: 'options',
          label: 'Options',
          type: 'checkbox',
          options: [
            { label: 'MCP server integration', value: 'mcp-integrate' },
            { label: 'Generate progress report', value: 'progress-report' }
          ]
        },
        {
          name: 'taskId',
          label: 'Task ID (if applicable)',
          type: 'text',
          placeholder: 'doc001'
        }
      ],
      actions: [
        { label: 'Run', action: 'run', primary: true },
        { label: 'Back', action: 'back-to-main' },
        { label: 'Cancel', action: 'cancel' }
      ]
    },
    'fix-docs': {
      title: 'Fix Documentation',
      description: 'Interactive tool to fix documentation issues',
      fields: [],
      actions: [
        { label: 'Start Interactive Mode', action: 'run', primary: true },
        { label: 'Back', action: 'back-to-main' },
        { label: 'Cancel', action: 'cancel' }
      ]
    }
  };
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    form: 'main',
    configFile: null,
    preset: null,
    dryRun: false,
    verbose: false,
    export: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--form=')) {
      config.form = arg.replace('--form=', '');
    } else if (arg.startsWith('--config=')) {
      config.configFile = arg.replace('--config=', '');
    } else if (arg.startsWith('--preset=')) {
      config.preset = arg.replace('--preset=', '');
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--verbose') {
      config.verbose = true;
    } else if (arg === '--export') {
      config.export = true;
    }
  }

  return config;
}

// Load configuration from file or preset
function loadFormConfig(config) {
  let formConfigs = {};
  
  if (config.configFile) {
    try {
      const filePath = path.resolve(process.cwd(), config.configFile);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      formConfigs = JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error loading configuration file: ${error.message}`);
      process.exit(1);
    }
  } else if (config.preset) {
    if (PRESETS[config.preset]) {
      formConfigs = PRESETS[config.preset];
    } else {
      console.error(`Unknown preset: ${config.preset}`);
      console.log('Available presets:');
      for (const presetName in PRESETS) {
        console.log(`  - ${presetName}`);
      }
      process.exit(1);
    }
  }
  
  // Handle legacy configs or configs with the new submitAction field
  for (const formName in formConfigs) {
    const formData = formConfigs[formName];
    if (formData.submitAction && !formData.action) {
      formData.action = formData.submitAction;
    } else if (!formData.submitAction && formData.action) {
      formData.submitAction = formData.action;
    }
  }
  
  return formConfigs;
}

// Export a template configuration for the form
function exportTemplateConfig(formDefinitions, formName) {
  const form = formDefinitions[formName];
  if (!form) {
    console.error(`Form "${formName}" not found in form definitions`);
    return;
  }
  
  const template = {};
  for (const field of form.fields) {
    if (field.type === 'checkbox') {
      template[field.name] = field.options.map(opt => opt.value);
    } else {
      template[field.name] = field.default || '';
    }
  }
  
  template.action = 'run';
  
  console.log(JSON.stringify({ [formName]: template }, null, 2));
  console.log('\nSave this to a JSON file and use it with --config=<file>');
}

// Execute command based on form data
function executeCommand(formData, actionType, formName, dryRun) {
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
        return executeCommand(formData, actionType, formData.tool, dryRun);
      }
      console.error(`Unknown form: ${formName}`);
      return;
  }
  
  console.log(`\nCommand: ${command} ${args.join(' ')}\n`);
  
  if (dryRun) {
    console.log('Dry run mode - command not executed');
    return;
  }
  
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
  const config = parseArgs();
  const formDefinitions = loadFormDefinitions();
  
  if (config.export) {
    exportTemplateConfig(formDefinitions, config.form);
    return;
  }
  
  const formConfigs = loadFormConfig(config);
  const formData = formConfigs[config.form];
  
  if (!formData) {
    console.error(`No configuration found for form: ${config.form}`);
    console.log('Available forms:');
    Object.keys(formDefinitions).forEach(form => {
      console.log(`  - ${form}`);
    });
    process.exit(1);
  }
  
  // Handle both action and submitAction fields for compatibility
  if (formData.submitAction && !formData.action) {
    formData.action = formData.submitAction;
  } else if (!formData.submitAction && formData.action) {
    formData.submitAction = formData.action;
  }
  
  if (config.verbose) {
    console.log(`Automated form filling for ${config.form}`);
    console.log('Form data:');
    console.log(JSON.stringify(formData, null, 2));
  }
  
  const actionToUse = formData.submitAction || formData.action || 'run';
  executeCommand(formData, actionToUse, config.form, config.dryRun);
}

// Run the main function
main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}); 