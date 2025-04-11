# User Proxy Form Component System

This documentation provides a comprehensive guide to the User Proxy Form Component system used throughout the Cursor Rules Extension project.

## Overview

The User Proxy Form Component system provides a flexible, configuration-driven approach to creating interactive forms for both CLI and web interfaces. It enables consistent form rendering across different environments while maintaining a single source of truth for form definitions.

## Key Features

- **Multi-environment rendering** - Forms can be rendered in CLI, web, or React environments
- **Declarative configuration** - Forms are defined using JSON configuration objects
- **Extensible** - New form types and components can be easily added
- **Integration with Taskmaster** - Seamless integration with the Taskmaster workflow
- **Documentation tools** - Built-in forms for running documentation tools

## Form Definition Structure

Each form is defined using a JSON configuration object with the following structure:

```javascript
{
  title: "Form Title",
  description: "Description of the form purpose",
  fields: [
    {
      type: "text",
      name: "fieldName",
      label: "Field Label",
      placeholder: "Placeholder text",
      required: true,
      default: "Default value",
      help: "Help text for this field"
    },
    // Additional fields...
  ],
  actions: [
    {
      label: "Submit",
      action: "submit-action",
      primary: true
    },
    // Additional actions...
  ]
}
```

## Available Field Types

The form system supports the following field types:

| Field Type | Description | Properties |
|------------|-------------|------------|
| `text` | Single-line text input | `name`, `label`, `placeholder`, `required`, `default`, `help` |
| `textarea` | Multi-line text input | `name`, `label`, `placeholder`, `required`, `default`, `help`, `rows` |
| `select` | Dropdown selection | `name`, `label`, `options`, `required`, `default`, `help` |
| `checkbox` | Boolean checkbox | `name`, `label`, `required`, `default`, `help` |
| `radio` | Radio button group | `name`, `label`, `options`, `required`, `default`, `help` |
| `file` | File selector | `name`, `label`, `accept`, `required`, `help` |
| `heading` | Section heading (not an input) | `text`, `level` |
| `info` | Informational text (not an input) | `text`, `style` |

## Action Properties

Each form has one or more actions that can be triggered:

| Property | Description | Type | Required |
|----------|-------------|------|----------|
| `label` | Display text for the action | String | Yes |
| `action` | Action identifier | String | Yes |
| `primary` | Flag for primary action | Boolean | No |
| `style` | Visual style (e.g., "danger") | String | No |
| `disabled` | Condition to disable the action | Boolean/Function | No |

## Available Forms

The system includes the following pre-configured forms:

### Documentation Analysis Form

Used to run documentation analysis tools.

```javascript
{
  title: "Documentation Analysis",
  description: "Analyze documentation for issues and inconsistencies",
  fields: [
    {
      type: "select",
      name: "scanTarget",
      label: "Documentation Scope",
      options: [
        { value: "taskmaster", label: "Taskmaster System" },
        { value: "all", label: "Entire Project" }
      ],
      default: "taskmaster"
    },
    {
      type: "checkbox",
      name: "verbose",
      label: "Verbose Output",
      default: false
    },
    {
      type: "select",
      name: "outputFormat",
      label: "Output Format",
      options: [
        { value: "md", label: "Markdown" },
        { value: "json", label: "JSON" },
        { value: "html", label: "HTML" }
      ],
      default: "md"
    }
  ],
  actions: [
    { label: "Run Analysis", action: "run-analysis", primary: true },
    { label: "Cancel", action: "cancel" }
  ]
}
```

### Terminology Checker Form

Used to check for terminology inconsistencies.

```javascript
{
  title: "Terminology Checker",
  description: "Check for terminology inconsistencies across the codebase",
  fields: [
    {
      type: "text",
      name: "codeDir",
      label: "Code Directory",
      placeholder: "./scripts",
      default: "./scripts"
    },
    {
      type: "text",
      name: "docsDir",
      label: "Documentation Directory",
      placeholder: "./docs",
      default: "./docs"
    },
    {
      type: "checkbox",
      name: "fix",
      label: "Fix Issues Automatically",
      default: false
    },
    {
      type: "checkbox",
      name: "verbose",
      label: "Verbose Output",
      default: false
    }
  ],
  actions: [
    { label: "Run Checker", action: "run-terminology-checker", primary: true },
    { label: "Cancel", action: "cancel" }
  ]
}
```

### Taskmaster Form

Used to access various Taskmaster functions.

```javascript
{
  title: "Taskmaster",
  description: "Run Taskmaster commands and workflows",
  fields: [
    {
      type: "select",
      name: "action",
      label: "Action",
      options: [
        { value: "list", label: "List Tasks" },
        { value: "start", label: "Start Task" },
        { value: "complete", label: "Complete Task" },
        { value: "analyze", label: "Analyze Task" },
        { value: "tradeoff", label: "Perform Tradeoff Analysis" }
      ],
      default: "list"
    },
    {
      type: "text",
      name: "taskId",
      label: "Task ID (optional)",
      placeholder: "e.g., task001"
    }
  ],
  actions: [
    { label: "Run Taskmaster", action: "run-taskmaster", primary: true },
    { label: "Back", action: "back" }
  ]
}
```

## Rendering Modes

The form system supports three rendering modes:

### CLI Mode

When rendered in CLI mode, forms are displayed in the terminal with interactive prompts:

```cli
==== Documentation Analysis ====
Analyze documentation for issues and inconsistencies

Documentation Scope [taskmaster]:
> taskmaster

Verbose Output [false]:
> true

Output Format [md]:
> json

1. Run Analysis
2. Cancel

Enter selection:
```

### Web Mode

In web mode, forms are rendered as HTML with appropriate input elements and styles.

### React Mode

In React mode, forms can be integrated with React applications using the provided components.

## Extending with New Forms

To add a new form to the system:

1. Define your form configuration in the `DEFAULT_CONFIG.forms` object in `scripts/user-proxy-form-component.js`:

```javascript
myNewForm: {
  title: "My New Form",
  description: "Description of my new form",
  fields: [
    // Define fields...
  ],
  actions: [
    // Define actions...
  ]
}
```

1. Add the form handler in your application code:

```javascript
function handleMyNewFormAction(action, formData) {
  if (action === 'my-custom-action') {
    // Implement action handling
    console.log('Form data:', formData);
    // Do something with the data...
  }
}
```

1. Connect the form to the handler:

```javascript
const formComponent = new UserProxyFormComponent({
  formName: 'myNewForm',
  onAction: handleMyNewFormAction
});

formComponent.render();
```

## API Reference

### UserProxyFormComponent Class

The main class for creating and rendering forms.

```javascript
const formComponent = new UserProxyFormComponent({
  renderMode: 'cli', // 'cli', 'web', or 'react'
  formName: 'documentationAnalysis', // Name of the form to render
  config: {}, // Optional custom configuration
  onAction: (action, formData) => {} // Action handler
});
```

### Methods

| Method | Description |
|--------|-------------|
| `render()` | Renders the form in the specified mode |
| `setFormData(data)` | Pre-fills the form with data |
| `getFormData()` | Gets the current form data |
| `validate()` | Validates the form and returns errors |
| `reset()` | Resets the form to default values |

### Events

The component emits the following events:

- `submit` - When a form is submitted
- `cancel` - When a form is cancelled
- `action` - When any action is triggered
- `change` - When any field value changes

## Usage Examples

### Running a Form from the Command Line

```javascript
// Invoke the form from a script
const { UserProxyFormComponent } = require('./scripts/user-proxy-form-component.js');

const form = new UserProxyFormComponent({
  renderMode: 'cli',
  formName: 'documentationAnalysis',
  onAction: (action, data) => {
    if (action === 'run-analysis') {
      console.log('Running analysis with:', data);
      // Run the analysis...
    }
  }
});

form.render();
```

### Integrating with a Web Application

```javascript
// In a web application
import { UserProxyFormComponent } from './scripts/user-proxy-form-component.js';

const container = document.getElementById('form-container');
const form = new UserProxyFormComponent({
  renderMode: 'web',
  formName: 'terminologyChecker',
  onAction: handleFormAction
});

form.render(container);

function handleFormAction(action, data) {
  if (action === 'run-terminology-checker') {
    // Handle the action...
  }
}
```

### Integrating with React

```jsx
// In a React component
import React, { useEffect, useRef } from 'react';
import { UserProxyFormComponent } from './scripts/user-proxy-form-component.js';

function FormContainer() {
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (containerRef.current) {
      const form = new UserProxyFormComponent({
        renderMode: 'react',
        formName: 'taskmaster',
        onAction: handleFormAction
      });
      
      form.render(containerRef.current);
    }
    
    return () => {
      // Cleanup if needed
    };
  }, []);
  
  function handleFormAction(action, data) {
    // Handle form actions
  }
  
  return <div ref={containerRef} />;
}

export default FormContainer;
```

## Troubleshooting

### Common Issues

1. **Form not rendering correctly in CLI mode**
   - Ensure your terminal supports ANSI colors
   - Check that the form definition is valid

2. **Actions not triggering**
   - Verify that the action handler is correctly implemented
   - Check that action names match between the form definition and handler

3. **Custom form not found**
   - Ensure the form is properly defined in the configuration
   - Check that the form name is correct (case-sensitive)

### Debugging

To enable debug mode, set the `debug` property in the configuration:

```javascript
const form = new UserProxyFormComponent({
  renderMode: 'cli',
  formName: 'documentationAnalysis',
  debug: true,
  onAction: handleAction
});
```

This will output additional information about form rendering and actions.

## Best Practices

1. **Form Organization**
   - Group related fields together
   - Use heading fields to create logical sections
   - Keep forms focused on a single task

2. **Field Naming**
   - Use consistent naming conventions for field names
   - Make field labels clear and concise
   - Provide helpful placeholder text

3. **Validation**
   - Mark required fields appropriately
   - Provide helpful error messages
   - Validate data on the server as well

4. **Actions**
   - Clearly label primary and secondary actions
   - Use consistent action naming patterns
   - Handle errors gracefully

## Conclusion

The User Proxy Form Component system provides a flexible and powerful way to create interactive forms across different environments. By following this guide, you can leverage the system to create consistent user interfaces throughout your application.
