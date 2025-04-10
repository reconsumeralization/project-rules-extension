# Project Rules 📋

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-%23007ACC)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> A powerful VS Code extension for managing and enforcing project-specific rules and conventions.

## ✨ Features

- 📝 **Rule Management** - Create, edit and organize project rules in markdown
- 🤖 **AI Integration** - Generate rules and improvements with AI assistance
- 🔄 **Synchronization** - Keep team rules in sync with server-based sharing
- 📊 **Task Management** - Create and track implementation tasks for rules
- 🧠 **MCP Protocol** - Advanced AI model context protocol management

## 🚀 Getting Started

### Prerequisites

- Visual Studio Code v1.80.0 or later
- Node.js (for development)

### Installation

1. Open VS Code.
2. Go to the Extensions view (Ctrl+Shift+X).
3. Search for "Project Rules".
4. Click "Install".

Alternatively, install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=reconsumeralization.project-rules-extension).

### First Steps

1. Open the Project Rules view from the activity bar (usually a clipboard icon).
2. Create your first rule using the command palette: `Project Rules: Create New Rule`.
3. Explore AI-powered features: `Project Rules: Suggest Rule Improvements`.

## 📝 Rule Management

Create custom rules in `.mdc` files that define coding standards, architectural guidelines, and project conventions:

- **Create rules** with easy-to-use templates
- **Edit rules** directly in VS Code
- **Organize rules** into categories
- **Generate rules** automatically from existing code files
- **Preview rules** with rendered markdown before saving
- **`.mdc` Format**: A markdown-based format allowing for metadata (like ID, category, severity) and rule content separation using front matter. Example:

  ```markdown
  ---
  id: PR001
  category: Formatting
  severity: Warning
  ---
  # Rule Title

  Rule description using standard markdown...
  ```

## 🤖 AI Integration

Leverage AI to improve your project guidelines:

- **Auto-generate rules** from existing code patterns
- **Get improvement suggestions** for existing rules
- **Autonomous monitoring** for rule violations and improvement opportunities
- **Fine-tune AI context** with configurable settings
- **Preview AI suggestions** before applying them using `projectRules.previewSuggestion`
- **Approve or dismiss** suggestions with `projectRules.approveSuggestedRule` and `projectRules.dismissSuggestedRule`

### How it Works

The AI integration analyzes your code (respecting `.gitignore` and configuration settings) and existing rules to:

- Identify patterns and suggest new rules.
- Compare rule descriptions with code style and suggest improvements.
- Generate implementation tasks based on rule requirements.
- Summarize large files or multiple files to fit context limits (configurable).

*Note: An API key for the AI service is required (`projectRules.ai.apiKey`).*

## 🔄 Rule Synchronization

Keep your team's rules consistent:

- **Server synchronization** for team-wide rule sharing
- **Background sync** at configurable intervals
- **Conflict resolution** with visual diff views
- **Fetch latest changes** without full synchronization
- **Offline support** with local-first operations

## 📊 Task Management

Implement rules with trackable tasks:

- **Create tasks** manually or with AI assistance
- **Generate implementation tasks** from rules
- **Estimate complexity** of implementation work using `projectRules.estimateTaskComplexity`
- **Assign ownership** to team members
- **Track progress** of rule implementation
- **View tasks** globally or filtered by rule (`projectRules.showTasksForRule`)

## 🧠 MCP Protocol Integration

Advanced AI model context management:

- **MCP Editor** for creating standardized AI context protocols
- **Agent Management** for monitoring AI assistants
- **Protocol Validation** to ensure consistency
- **Agent Statistics** for tracking performance
- **Autonomy Controls** for AI-driven suggestions

## ✨ Visual Examples

*(Placeholder: Add screenshots/GIFs showing the Rule Explorer, Task View, MCP Agent Monitor, AI Suggestion Preview, etc.)*

## ⌨️ Key Commands

### Rule Management

| Command | Description |
|---------|-------------|
| `projectRules.createRule` | Create a new rule with a template |
| `projectRules.generateRuleFromFile` | Generate a rule from the current file |
| `projectRules.suggestRuleImprovements` | Get AI suggestions for a rule |
| `projectRules.previewSuggestion` | Preview an AI-suggested rule change |
| `projectRules.approveSuggestedRule` | Approve an AI suggestion |
| `projectRules.dismissSuggestedRule` | Dismiss an AI suggestion |

### Synchronization

| Command | Description |
|---------|-------------|
| `projectRules.syncRules` | Synchronize rules with the server |
| `projectRules.fetchServerChanges` | Download latest rules from server |
| `projectRules.createTask` | Create a new task manually |
| `projectRules.createTaskWithAI` | Create a task using AI |
| `projectRules.generateTasksForRule` | Generate tasks for implementing a rule |
| `projectRules.showTasks` | Show the tasks view |
| `projectRules.showTasksForRule` | Show tasks associated with a specific rule |
| `projectRules.estimateTaskComplexity` | Estimate complexity for a selected task |
| `projectRules.assignTaskToMe` | Assign a task to yourself |

### MCP Management

| Command | Description |
|---------|-------------|
| `projectRules.openMcpAgentsView` | Show MCP Server Agents |
| `projectRules.refreshMcpAgents` | Refresh agent list |
| `projectRules.refreshAgentStats` | Update statistics for a single agent |
| `projectRules.refreshAllAgentStats` | Refresh statistics for all agents |

### AI Autonomy

| Command | Description |
|---------|-------------|
| `projectRules.toggleAiAutonomy` | Toggle AI autonomy on/off |
| `projectRules.triggerAiCycle` | Manually trigger AI analysis cycle |

## ⚙️ Configuration

### Server Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `projectRules.serverUrl` | URL of the Project Rules server | `http://localhost:3000` |
| `projectRules.authToken` | Authentication token for the server API | `` |
| `projectRules.syncInterval` | Background sync interval in seconds | `300` |

### MCP Agent Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `projectRules.mcpAgents.autoRefreshOnFocus` | Auto-refresh agent stats on window focus | `true` |

### AI Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `projectRules.ai.apiKey` | API Key for the AI service | `` |
| `projectRules.ai.context.maxFileChars` | Max characters from a file before summarization | `2000` |
| `projectRules.ai.context.enableSummarization` | Enable AI-powered summarization | `true` |
| `projectRules.ai.context.maxFiles` | Max number of files to include in AI context | `5` |

## 🔧 Architecture

The extension follows a standard VS Code architecture:

1. **Extension Host (Node.js)**: Runs the core logic, file system access, and interacts with the VS Code API.
2. **Webview (Browser)**: Renders the UI components (Rule Explorer, Task View, MCP Editor) using web technologies (React, Tailwind assumed).
3. **Message Passing**: A secure bridge for communication between the Extension Host and Webview environments.

*(Placeholder: Add link to a diagram or more detailed architecture doc if available)*

## 🛠️ Development Setup

To contribute or run the extension locally:

1. **Clone the repository:**

    ```bash
    git clone https://github.com/reconsumeralization/project-rules-extension.git
    cd project-rules-extension
    ```

2. **Install dependencies:**

    ```bash
    npm install
    # or yarn install
    ```

3. **Build the extension:**

    ```bash
    npm run compile
    # or yarn compile (or specific build script)
    ```

4. **Open in VS Code:**

    ```bash
    code .
    ```

5. **Run the extension:** Press `F5` to open a new Extension Development Host window with the extension loaded.

### Webpack Configuration

This extension uses webpack for bundling both the Node.js extension code and browser-based webview UI components. See [webpack.config.js](./webpack.config.js) for the configuration details.

### Debugging

- Use the VS Code debugger (`F5`) to debug the Extension Host code.
- To debug Webview UI components, open the Extension Development Host window, run `Developer: Open Webview Developer Tools` from the command palette, and use the browser's developer tools.

### Testing

*(Placeholder: Describe the testing strategy - unit tests, integration tests, e2e tests. Mention commands like `npm test` or `yarn test`)*

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests

Please follow our contribution guidelines when participating.

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

*(Placeholder: Create a CHANGELOG.md file if it doesn't exist)*

## 📄 License

[MIT](LICENSE)

## 👤 Author

[reconsumeralization](https://github.com/reconsumeralization)

## 🌐 Repository

[https://github.com/reconsumeralization/project-rules-extension](https://github.com/reconsumeralization/project-rules-extension)

## 🔑 Keywords

VS Code, Extension, Rules Engine, Linting, Code Standards, Conventions, AI, Automation, Task Management, MCP, Protocol, Developer Tools

---

Made with ❤️ for developers who care about code quality and documentation
