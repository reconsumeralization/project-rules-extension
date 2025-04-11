import * as vscode from 'vscode';

/**
 * Mock AI Service that simulates the behavior of an AI service.
 */
class MockAIService {
  /**
   * Simulates an AI call to generate rule suggestions
   */
  async generateRuleSuggestion(fileName: string, fileContent: string): Promise<string> {
    console.log(`Generating rule suggestion for ${fileName}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate suggestion based on file extension
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    
    if (fileExt === 'ts' || fileExt === 'tsx') {
      return `# TypeScript Naming Convention\n\n## Description\nUse camelCase for variables and functions, PascalCase for classes and interfaces.\n\n## Applies to\n*.ts, *.tsx\n\n## Examples\n\n### Good\n\`\`\`typescript\nconst userName = 'John';\nfunction calculateTotal() { }\nclass UserProfile { }\ninterface ApiResponse { }\n\`\`\`\n\n### Bad\n\`\`\`typescript\nconst user_name = 'John';\nfunction calculate_total() { }\nclass userProfile { }\ninterface api_response { }\n\`\`\``;
    } else if (fileExt === 'js' || fileExt === 'jsx') {
      return `# JavaScript Naming Convention\n\n## Description\nUse camelCase for variables and functions, PascalCase for classes.\n\n## Applies to\n*.js, *.jsx\n\n## Examples\n\n### Good\n\`\`\`javascript\nconst userName = 'John';\nfunction calculateTotal() { }\nclass UserProfile { }\n\`\`\`\n\n### Bad\n\`\`\`javascript\nconst user_name = 'John';\nfunction calculate_total() { }\nclass userProfile { }\n\`\`\``;
    } else {
      return `# General Coding Standard\n\n## Description\nConsistent indentation and spacing improves code readability.\n\n## Applies to\n*.*\n\n## Examples\n\n### Good\n\`\`\`\nfunction example() {\n    const x = 1;\n    if (x > 0) {\n        return true;\n    }\n}\n\`\`\`\n\n### Bad\n\`\`\`\nfunction example() {\nconst x = 1;\nif(x>0){\nreturn true;\n}\n}\n\`\`\``;
    }
  }
}

// Global service instance
let aiService: MockAIService;

export function activate(context: vscode.ExtensionContext) {
	console.log('Minimal extension activated!');
	
	// Initialize services
	aiService = new MockAIService();
	
	// Register a simple command
	const disposable = vscode.commands.registerCommand('projectRules.minimalTest', () => {
		vscode.window.showInformationMessage('Hello from minimal test extension!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	console.log('Minimal extension deactivated!');
} 