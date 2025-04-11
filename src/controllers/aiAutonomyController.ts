import * as vscode from 'vscode';
import { AiAutonomyService } from '../services/aiAutonomyService';

// --- Module State ---
let aiAutonomyServiceInstance: AiAutonomyService | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * Initializes the AI Autonomy Controller.
 * @param context The extension context.
 * @param aiAutonomyService The instance of the AiAutonomyService.
 */
export function initializeAiAutonomyController(
    context: vscode.ExtensionContext,
    aiAutonomyService: AiAutonomyService
): void {
    aiAutonomyServiceInstance = aiAutonomyService;
    extensionContext = context;

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ProjectRules.approveSuggestedRule', approveSuggestedRuleCommand),
        vscode.commands.registerCommand('ProjectRules.dismissSuggestedRule', dismissSuggestedRuleCommand),
        vscode.commands.registerCommand('ProjectRules.previewSuggestion', previewSuggestionCommand),
        vscode.commands.registerCommand('ProjectRules.toggleAiAutonomy', toggleAiAutonomyCommand),
        vscode.commands.registerCommand('ProjectRules.triggerAiCycle', triggerAiCycleCommand)
    );
}

/**
 * Command handler to approve a suggested rule.
 * Expects the index of the suggestion as an argument (e.g., from a TreeItem context value).
 * If no argument is provided, it could potentially show a QuickPick (more complex).
 */
async function approveSuggestedRuleCommand(suggestionArg?: number | { index: number }): Promise<void> {
    if (!aiAutonomyServiceInstance) {
        vscode.window.showErrorMessage('AI Autonomy Service not available.');
        return;
    }

    let suggestionIndex: number | undefined;

    if (typeof suggestionArg === 'number') {
        suggestionIndex = suggestionArg;
    } else if (typeof suggestionArg === 'object' && typeof suggestionArg.index === 'number') {
        suggestionIndex = suggestionArg.index;
    } else {
        // If called without args (e.g., command palette), prompt the user
        const suggestions = aiAutonomyServiceInstance.getPendingRuleSuggestions();
        if (!suggestions || suggestions.length === 0) {
            vscode.window.showInformationMessage('No pending AI rule suggestions found.');
            return;
        }
        const picks = suggestions.map((s, index) => ({ label: s.title, description: `Suggestion ${index + 1}`, index }));
        const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select suggested rule to approve' });
        if (selected) {
            suggestionIndex = selected.index;
        }
    }

    if (suggestionIndex !== undefined && suggestionIndex >= 0) {
        await aiAutonomyServiceInstance.approveSuggestion(suggestionIndex);
        // UI should refresh via the event emitter
    } else {
        console.log('Approve suggestion command cancelled or index invalid.');
    }
}

/**
 * Command handler to dismiss a suggested rule.
 * Expects the index of the suggestion as an argument.
 */
async function dismissSuggestedRuleCommand(suggestionArg?: number | { index: number }): Promise<void> {
    if (!aiAutonomyServiceInstance) {
        vscode.window.showErrorMessage('AI Autonomy Service not available.');
        return;
    }

    let suggestionIndex: number | undefined;

    if (typeof suggestionArg === 'number') {
        suggestionIndex = suggestionArg;
    } else if (typeof suggestionArg === 'object' && typeof suggestionArg.index === 'number') {
        suggestionIndex = suggestionArg.index;
    } else {
        // Prompt user if called without args
        const suggestions = aiAutonomyServiceInstance.getPendingRuleSuggestions();
        if (!suggestions || suggestions.length === 0) {
            vscode.window.showInformationMessage('No pending AI rule suggestions found.');
            return;
        }
        const picks = suggestions.map((s, index) => ({ label: s.title, description: `Suggestion ${index + 1}`, index }));
        const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select suggested rule to dismiss' });
        if (selected) {
            suggestionIndex = selected.index;
        }
    }

    if (suggestionIndex !== undefined && suggestionIndex >= 0) {
        aiAutonomyServiceInstance.dismissSuggestion(suggestionIndex);
        // UI should refresh via the event emitter
    } else {
        console.log('Dismiss suggestion command cancelled or index invalid.');
    }
}

/**
 * Command handler to preview a suggested rule in a temporary document.
 * Expects the index of the suggestion as an argument.
 */
async function previewSuggestionCommand(suggestionArg?: number | { index: number }): Promise<void> {
    if (!aiAutonomyServiceInstance) {
        vscode.window.showErrorMessage('AI Autonomy Service not available.');
        return;
    }

    let suggestionIndex: number | undefined;

    if (typeof suggestionArg === 'number') {
        suggestionIndex = suggestionArg;
    } else if (typeof suggestionArg === 'object' && typeof suggestionArg.index === 'number') {
        suggestionIndex = suggestionArg.index;
    } else {
        // Prompt user if called without args (less likely for preview)
        const suggestions = aiAutonomyServiceInstance.getPendingRuleSuggestions();
        if (!suggestions || suggestions.length === 0) {
            vscode.window.showInformationMessage('No pending AI rule suggestions found to preview.');
            return;
        }
        const picks = suggestions.map((s, index) => ({ label: s.title, description: `Suggestion ${index + 1}`, index }));
        const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select suggested rule to preview' });
        if (selected) {
            suggestionIndex = selected.index;
        }
    }

    if (suggestionIndex !== undefined && suggestionIndex >= 0) {
        const suggestions = aiAutonomyServiceInstance.getPendingRuleSuggestions();
        if (suggestionIndex < suggestions.length) {
            const suggestion = suggestions[suggestionIndex];
            try {
                // Create content for the temporary file
                const previewContent = `\`\`\`markdown
# AI Suggested Rule: ${suggestion.title}

**Source Task ID:** ${suggestion.sourceTaskId || 'Unknown'}

---

${suggestion.content}
\`\`\`

*This is a preview of an AI-suggested rule. Use the context menu in the Rules view (under "AI Suggestions") to Approve or Dismiss it.*`;

                // Open content in a new untitled text document
                const doc = await vscode.workspace.openTextDocument({
                    content: previewContent,
                    language: 'markdown' // Set language to markdown for syntax highlighting
                });
                await vscode.window.showTextDocument(doc, { preview: true }); // Open as preview
            } catch (error) {
                console.error('Error showing suggestion preview:', error);
                vscode.window.showErrorMessage(`Failed to show preview for suggestion: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            vscode.window.showErrorMessage('Invalid suggestion index for preview.');
        }
    } else {
        console.log('Preview suggestion command cancelled or index invalid.');
    }
}

/**
 * Command handler to toggle AI Autonomy on/off.
 */
function toggleAiAutonomyCommand(): void {
     if (!aiAutonomyServiceInstance) {
        vscode.window.showErrorMessage('AI Autonomy Service not available.');
        return;
    }
    aiAutonomyServiceInstance.toggleAiAutonomy();
}

/**
 * Command handler to manually trigger one AI processing cycle.
 */
async function triggerAiCycleCommand(): Promise<void> {
     if (!aiAutonomyServiceInstance) {
        vscode.window.showErrorMessage('AI Autonomy Service not available.');
        return;
    }
    if (!aiAutonomyServiceInstance.isAutonomyEnabled()) {
        vscode.window.showWarningMessage('AI Autonomy is currently disabled. Enable it first to trigger a cycle.');
        return;
    }
    
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Manually triggering AI Autonomy cycle...',
        cancellable: false
    }, async () => {
        try {
            const results = await aiAutonomyServiceInstance!.triggerProcessingCycle();
             vscode.window.showInformationMessage(`Manual AI cycle finished. Tasks completed: ${results.tasksCompleted}, Tasks created: ${results.tasksCreated}, Rules suggested: ${results.rulesGenerated}`);
        } catch (error) {
             vscode.window.showErrorMessage(`Manual AI cycle failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
} 

export function initialize(context: vscode.ExtensionContext, aiAutonomyService: AiAutonomyService) {
  throw new Error('Function not implemented.');
}
