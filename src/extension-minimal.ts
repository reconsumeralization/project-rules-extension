import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Project Rules extension is now active!');

  // Register a simple command that shows a message box
  const disposable = vscode.commands.registerCommand('projectRules.testCommand', () => {
    vscode.window.showInformationMessage('Project Rules extension is working!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('Project Rules extension is now deactivated!');
} 