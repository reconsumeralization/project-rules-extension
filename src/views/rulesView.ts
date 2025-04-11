import * as vscode from 'vscode'
import * as path from 'path'
import * as ruleController from '../controllers/ruleController' // Import the controller module
import { Rule, getRuleAppliesToDisplay } from '../models/rule' // Import model and helper
import { AiAutonomyService } from '../services/aiAutonomyService' // Import AiAutonomyService
import * as localStorageService from '../services/localStorageService' // Import localStorageService

interface SuggestedRule { // Re-define or import if possible
    title: string;
    content: string;
    sourceTaskId?: string;
}

// Define types for tree items
type RuleTreeItem = Rule | AiSuggestionItem | StaticTreeItem;

// Represent the static "AI Suggestions" node
class StaticTreeItem {
    constructor(public readonly id: string, public readonly label: string) {}
}
// Represent a single suggestion item
class AiSuggestionItem {
    constructor(public readonly index: number, public readonly suggestion: SuggestedRule) {}
}

export class RulesViewProvider implements vscode.TreeDataProvider<RuleTreeItem> {
  public static readonly viewType = 'ProjectRules.rulesView'

  private _onDidChangeTreeData: vscode.EventEmitter<RuleTreeItem | undefined | null | void> = new vscode.EventEmitter<RuleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RuleTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private _context: vscode.ExtensionContext
  private _aiAutonomyService: AiAutonomyService // Store the service instance
  private _ruleChangeSubscription?: vscode.Disposable
  private _suggestionChangeSubscription?: vscode.Disposable // Listener for suggestions

  constructor(context: vscode.ExtensionContext, aiAutonomyService: AiAutonomyService) {
    this._context = context
    this._aiAutonomyService = aiAutonomyService // Store it

    // Listen for rule changes (existing)
    this._ruleChangeSubscription = ruleController.onRulesDidChange(() => {
      this.refresh();
    })
    context.subscriptions.push(this._ruleChangeSubscription)

    // Listen for suggestion changes (NEW)
    this._suggestionChangeSubscription = this._aiAutonomyService.onDidUpdatePendingSuggestions(() => {
      console.log("RulesViewProvider: Detected suggestion change, refreshing view.")
      this.refresh() // Refresh the entire view when suggestions change
    })
    context.subscriptions.push(this._suggestionChangeSubscription)

    console.log('RulesViewProvider initialized.')
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }
  
  getTreeItem(element: RuleTreeItem): vscode.TreeItem {
    if (element instanceof StaticTreeItem) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed)
      item.id = element.id
      item.iconPath = new vscode.ThemeIcon('lightbulb-sparkle')
      return item
    } else if (element instanceof AiSuggestionItem) {
      const suggestion = element.suggestion
      const item = new vscode.TreeItem(suggestion.title, vscode.TreeItemCollapsibleState.None)
      item.id = `suggestion-${element.index}`
      item.description = `Suggested Rule`
      item.tooltip = new vscode.MarkdownString(`**Suggestion:**\n\n\`\`\`markdown\n${suggestion.content.substring(0, 100)}...\n\`\`\`\n\n*Source Task ID:* ${suggestion.sourceTaskId || 'Unknown'}`)
      item.iconPath = new vscode.ThemeIcon('lightbulb')
      item.contextValue = 'aiSuggestion'
      // Pass index in command arguments for context menus
      item.command = {
        command: 'ProjectRules.previewSuggestion', // Placeholder command for preview
        title: 'Preview Suggestion',
        arguments: [element.index]
      }
      return item
    } else {
      const rule = element as Rule // Cast element to Rule type
      const item = new vscode.TreeItem(rule.metadata.filename, vscode.TreeItemCollapsibleState.None)
      item.id = rule.metadata.id
      // Need localStorageService to build the URI
      localStorageService.getRuleUri(this._context, rule.metadata.id).then(uri => {
        if (uri) {
          item.resourceUri = uri
          item.command = {
            command: 'vscode.open',
            title: 'Open Rule File',
            arguments: [uri],
          }
        } else {
          console.warn("RulesViewProvider: Could not get rules directory URI.")
        }
      }).catch(err => {
        console.error("RulesViewProvider: Error getting rule URI:", err)
      })
      
      item.contextValue = 'rule'
      item.iconPath = new vscode.ThemeIcon('book')
      switch (rule.metadata.syncStatus) {
        case 'conflict':
          item.description = 'Conflict'
          item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
          break
        case 'local-only':
          item.description = 'Local'
          item.iconPath = new vscode.ThemeIcon('cloud-upload', new vscode.ThemeColor('list.inactiveSelectionForeground'))
          break
        case 'server-only':
          item.description = 'Server'
          item.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('list.inactiveSelectionForeground'))
          break
      }
      return item
    }
  }

  getChildren(element?: RuleTreeItem): Thenable<RuleTreeItem[]> {
    if (element instanceof StaticTreeItem && element.id === 'ai-suggestions-group') {
      const suggestions = this._aiAutonomyService.getPendingRuleSuggestions()
      return Promise.resolve(
        suggestions.map((suggestion, index) => new AiSuggestionItem(index, suggestion))
      )
    } else if (element instanceof AiSuggestionItem) {
      return Promise.resolve([])
    } else if (!element) {
      const rules = ruleController.getRules()
      const suggestions = this._aiAutonomyService.getPendingRuleSuggestions()
      
      const rootItems: RuleTreeItem[] = [...rules]
      
      if (suggestions.length > 0) {
        rootItems.push(new StaticTreeItem('ai-suggestions-group', `AI Suggestions (${suggestions.length})`)) // Show count
      }
      
      rootItems.sort((a, b) => {
        if ('metadata' in a && 'metadata' in b) {
          return a.metadata.filename.localeCompare(b.metadata.filename)
        }
        if ('metadata' in a && !('metadata' in b)) {return -1}
        if (!('metadata' in a) && 'metadata' in b) {return 1}
        return 0
      })

      return Promise.resolve(rootItems)
    } else {
      return Promise.resolve([])
    }
  }

  dispose(): void {
    this._ruleChangeSubscription?.dispose()
    this._suggestionChangeSubscription?.dispose()
    this._onDidChangeTreeData.dispose()
  }
}

// Helper function to generate a random nonce for CSP
function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
} 