import * as vscode from 'vscode'
import { TaskAiService } from './taskAiService'
import * as taskController from '../controllers/taskController'
import * as ruleController from '../controllers/ruleController'
import { Task, TaskPriority, TaskStatus, sortTasks } from '../models/task'
import { Rule } from '../models/rule'

// Define the interface for suggestions
interface SuggestedRule {
    title: string;
    content: string;
    sourceTaskId?: string; 
}

/**
 * Service for managing autonomous AI operations for rules and tasks
 */
export class AiAutonomyService {
  startCycleIfEnabled() {
    throw new Error('Method not implemented.')
  }
  private _extensionContext: vscode.ExtensionContext
  private _taskAiService: TaskAiService
  private _processingInterval: NodeJS.Timeout | null = null
  private _statusBarItem: vscode.StatusBarItem
  private _isProcessing = false
  private _autonomyEnabled = false
  private _processingIntervalMs = 5 * 60 * 1000 // 5 minutes
  private _autonomousCycleRunningEmitter = new vscode.EventEmitter<boolean>()
  private _taskCompletionChance = 0.7 // 70% chance to complete a task
  private _ruleGenerationChance = 0.3 // 30% chance to generate a rule after completing a task
  private _followUpTaskChance = 0.8 // 80% chance to generate follow-up tasks
  private _pendingRuleSuggestions: SuggestedRule[] = []
  private readonly _onDidUpdatePendingSuggestions = new vscode.EventEmitter<void>()
  
  // Public event that can be subscribed to for autonomous cycle status
  public readonly onAutonomousCycleRunningChanged = this._autonomousCycleRunningEmitter.event
  public readonly onDidUpdatePendingSuggestions: vscode.Event<void> = this._onDidUpdatePendingSuggestions.event

  constructor(
    context: vscode.ExtensionContext,
    taskAiService: TaskAiService
  ) {
    this._extensionContext = context
    this._taskAiService = taskAiService
    
    // Create status bar item
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    )
    this._statusBarItem.command = 'cursor-rules.toggleAiAutonomy'
    this._statusBarItem.tooltip = 'Toggle AI Autonomy'
    this._updateStatusBar()
    this._statusBarItem.show()
    
    // Register the status bar item to be disposed
    context.subscriptions.push(this._statusBarItem)
    
    // Load pending suggestions on activation
    this._loadPendingSuggestions()
  }
  
  /**
   * Starts AI autonomy processing
   */
  startAiAutonomy(): void {
    if (this._autonomyEnabled) {
      return
    }
    
    this._autonomyEnabled = true
    this._updateStatusBar()
    
    // Start processing interval if not already started
    if (!this._processingInterval) {
      this._startProcessingInterval()
    }
    
    vscode.window.showInformationMessage('AI Autonomy has been enabled')
  }
  
  /**
   * Stops AI autonomy processing
   */
  stopAiAutonomy(): void {
    if (!this._autonomyEnabled) {
      return
    }
    
    this._autonomyEnabled = false
    this._updateStatusBar()
    
    // Stop processing interval
    this._stopProcessingInterval()
    
    vscode.window.showInformationMessage('AI Autonomy has been disabled')
  }
  
  /**
   * Toggles AI autonomy on/off
   */
  toggleAiAutonomy(): void {
    if (this._autonomyEnabled) {
      this.stopAiAutonomy()
    } else {
      this.startAiAutonomy()
    }
  }
  
  /**
   * Check if AI autonomy is currently enabled
   */
  isAutonomyEnabled(): boolean {
    return this._autonomyEnabled
  }
  
  /**
   * Manually triggers a single autonomous processing cycle
   * @returns Summary of actions taken
   */
  async triggerProcessingCycle(): Promise<{
    tasksCompleted: number
    tasksCreated: number
    rulesGenerated: number
  }> {
    if (this._isProcessing) {
      vscode.window.showInformationMessage('AI autonomy is already processing tasks')
      return { tasksCompleted: 0, tasksCreated: 0, rulesGenerated: 0 }
    }
    
    return await this._processAutonomousCycle()
  }
  
  /**
   * Sets the processing interval in milliseconds
   * @param intervalMs Interval in milliseconds
   */
  setProcessingInterval(intervalMs: number): void {
    if (intervalMs < 30000) { // Minimum 30 seconds
      intervalMs = 30000
    }
    
    this._processingIntervalMs = intervalMs
    
    // Restart interval if running
    if (this._processingInterval) {
      this._stopProcessingInterval()
      this._startProcessingInterval()
    }
  }
  
  /**
   * Returns a copy of the current pending rule suggestions.
   */
  public getPendingRuleSuggestions(): SuggestedRule[] {
    return [...this._pendingRuleSuggestions] // Return a copy
  }
  
  /**
   * Approves a suggestion by index, creates the rule, and removes the suggestion.
   * @param suggestionIndex The index of the suggestion in the pending list.
   * @returns The ID of the created rule, or null if creation failed.
   */
  public async approveSuggestion(suggestionIndex: number): Promise<string | null> {
    if (suggestionIndex < 0 || suggestionIndex >= this._pendingRuleSuggestions.length) {
      console.error(`Invalid suggestion index: ${suggestionIndex}`);
      vscode.window.showErrorMessage(`Invalid suggestion index.`);
      return null;
    }
    const suggestion = this._pendingRuleSuggestions[suggestionIndex];
    try {
      console.log(`AI Autonomy Service: Approving suggested rule: "${suggestion.title}"`);
      const ruleId = await ruleController.createRuleProgrammatically(
        this._extensionContext,
        suggestion.title,
        suggestion.content,
        true // Mark as AI-generated
      );

      if (ruleId) {
        this._pendingRuleSuggestions.splice(suggestionIndex, 1);
        this._onDidUpdatePendingSuggestions.fire();
        this._savePendingSuggestions(); // Save changes
        vscode.window.showInformationMessage(`Successfully created rule: "${suggestion.title}"`);
        return ruleId;
      } else {
        vscode.window.showWarningMessage(`Failed to create rule: "${suggestion.title}". It remains as a suggestion.`);
        return null;
      }
    } catch (error) {
      console.error(`Error approving suggested rule:`, error);
      vscode.window.showErrorMessage(`Error creating rule "${suggestion.title}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Dismisses a suggestion by index, removing it from the pending list.
   * @param suggestionIndex The index of the suggestion.
   */
  public dismissSuggestion(suggestionIndex: number): void {
    if (suggestionIndex < 0 || suggestionIndex >= this._pendingRuleSuggestions.length) {
      console.error(`Invalid suggestion index: ${suggestionIndex}`);
      vscode.window.showErrorMessage(`Invalid suggestion index.`);
      return;
    }
    const suggestion = this._pendingRuleSuggestions[suggestionIndex];
    console.log(`AI Autonomy Service: Dismissing suggested rule: "${suggestion.title}"`);
    this._pendingRuleSuggestions.splice(suggestionIndex, 1);
    this._onDidUpdatePendingSuggestions.fire();
    this._savePendingSuggestions(); // Save changes
    vscode.window.showInformationMessage(`Dismissed suggested rule: "${suggestion.title}"`);
  }
  
  // Private helper methods
  
  /**
   * Starts the background processing interval
   */
  private _startProcessingInterval(): void {
    if (this._processingInterval) {
      clearInterval(this._processingInterval)
    }
    
    this._processingInterval = setInterval(async () => {
      if (this._autonomyEnabled && !this._isProcessing) {
        await this._processAutonomousCycle()
      }
    }, this._processingIntervalMs)
  }
  
  /**
   * Stops the background processing interval
   */
  private _stopProcessingInterval(): void {
    if (this._processingInterval) {
      clearInterval(this._processingInterval)
      this._processingInterval = null
    }
  }
  
  /**
   * Updates the status bar item to reflect current state
   */
  private _updateStatusBar(): void {
    if (this._autonomyEnabled) {
      if (this._isProcessing) {
        this._statusBarItem.text = '$(sync~spin) AI Working...'
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      } else {
        this._statusBarItem.text = '$(robot) AI Autonomy: On'
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground')
      }
    } else {
      this._statusBarItem.text = '$(robot) AI Autonomy: Off'
      this._statusBarItem.backgroundColor = undefined
    }
  }
  
  /**
   * Processes a single autonomous cycle
   * @returns Summary of actions taken
   */
  private async _processAutonomousCycle(): Promise<{
    tasksCompleted: number
    tasksCreated: number
    rulesGenerated: number // Keep track of potential rule suggestions
  }> {
    if (this._isProcessing) {
      return { tasksCompleted: 0, tasksCreated: 0, rulesGenerated: 0 }
    }
    
    this._isProcessing = true
    this._autonomousCycleRunningEmitter.fire(true)
    this._updateStatusBar()
    
    let cycleTasksCompleted = 0
    let cycleTasksCreated = 0 
    let cycleRulesSuggested = 0 // Renamed for clarity
    
    try {
      const allTasks = taskController.getTasks()
      let aiTasks = allTasks.filter(task => 
        (task.metadata.assignedTo === 'AI' || task.metadata.assignedTo === 'AI Assistant') && 
        task.status !== 'completed' && task.status !== 'blocked'
      )
      
      console.log(`AI Autonomy cycle: Found ${aiTasks.length} actionable tasks assigned to AI.`);

      // --- Prioritize Tasks --- 
      // Sort the tasks using the utility function from task model
      // This sorts by status (irrelevant here as we filtered), then priority, due date, created date.
      aiTasks = sortTasks(aiTasks);
      console.log(`AI Autonomy cycle: Prioritized tasks. Order: ${aiTasks.map(t => `${t.metadata.title}(${t.priority})`).join(', ')}`);

      if (aiTasks.length === 0) {
        console.log('AI Autonomy cycle: No actionable tasks found.');
        // No need to proceed further if no tasks
        this._isProcessing = false;
        this._autonomousCycleRunningEmitter.fire(false);
        this._updateStatusBar();
        return { tasksCompleted: 0, tasksCreated: 0, rulesGenerated: 0 };
      }
      
      // Process each task using TaskAiService
      for (const task of aiTasks) {
        console.log(`AI Autonomy cycle: Processing task "${task.metadata.title}" (ID: ${task.metadata.id})`);
        let skipFollowUps = false; // Flag to skip generating follow-ups if task is blocked
        try {
            // Execute the task via TaskAiService
            const executionResult = await this._taskAiService.executeTask(task.metadata.id);
            
            console.log(`AI Autonomy cycle: Task ${task.metadata.id} execution result status: ${executionResult.status}, completed: ${executionResult.completed}, result:`, executionResult.result);

            // --- Handle Task Status Update --- 
            // Status is already updated within executeTask, but we count completions here
            if (executionResult.completed) {
                cycleTasksCompleted++;
                console.log(`AI Autonomy cycle: Task ${task.metadata.id} marked completed.`);
            } else if (executionResult.status === 'blocked') {
                 console.log(`AI Autonomy cycle: Task ${task.metadata.id} is blocked. Reason: ${executionResult.result}`);
                 // Optional: Add result as comment or update description - skip for now
                 skipFollowUps = true; // Mark to skip follow-up generation for blocked tasks
            } else {
                 console.log(`AI Autonomy cycle: Task ${task.metadata.id} remains in progress.`);
                 // Optional: Add result as comment or update description - skip for now
            }
            
            // --- Process Generated Tasks (only if not blocked) --- 
            if (!skipFollowUps && executionResult.generatedTasks && executionResult.generatedTasks.length > 0) {
                console.log(`AI Autonomy cycle: AI generated ${executionResult.generatedTasks.length} follow-up tasks for task ${task.metadata.id}.`);
                for (const partialTask of executionResult.generatedTasks) {
                    try {
                         const taskArgs = {
                           title: partialTask.metadata?.title || 'Untitled AI Task', 
                           description: partialTask.metadata?.description,
                           // Default assignee or use provided? Let's default to AI
                           assignedTo: partialTask.metadata?.assignedTo || 'AI Assistant', 
                           dueDate: partialTask.metadata?.dueDate,
                           aiGenerated: true,
                           // Default status/priority or use provided?
                           status: partialTask.status || 'todo',
                           priority: partialTask.priority || 'medium',
                           // Link to the same rule as the parent task
                           ruleId: task.ruleId || partialTask.ruleId 
                         };
                         
                         if (taskArgs.title && taskArgs.title !== 'Untitled AI Task') {
                             console.log(`AI Autonomy cycle: Creating generated task: "${taskArgs.title}"`);
                             await taskController.createNewTask(this._extensionContext, taskArgs);
                             cycleTasksCreated++;
                         } else {
                             console.warn('AI Autonomy cycle: Skipping generated task due to missing or default title.', partialTask);
                         }
                    } catch (createError) {
                        console.error(`AI Autonomy cycle: Failed to create AI generated task:`, createError, partialTask);
                    }
                }
            }
            
            // --- Process Suggested Rules - Store them (only if not blocked) --- 
            if (!skipFollowUps && executionResult.suggestedRules && executionResult.suggestedRules.length > 0) {
                let newSuggestionsAdded = false;
                let countAdded = 0;
                console.log(`AI Autonomy cycle: AI suggested ${executionResult.suggestedRules.length} new rules... Storing as pending.`);
                
                for (const ruleSuggestion of executionResult.suggestedRules) {
                    const title = ruleSuggestion.title;
                    const content = ruleSuggestion.content;
                    
                    if (title && content) {
                        // Optional: Check for duplicates before adding?
                        // const exists = this._pendingRuleSuggestions.some(p => p.title === title && p.content === content);
                        // if (!exists) {
                            this._pendingRuleSuggestions.push({ title, content, sourceTaskId: task.metadata.id });
                            newSuggestionsAdded = true;
                            countAdded++;
                        // }
                    } else { console.warn('AI Autonomy cycle: Skipping suggested rule due to missing title or content.', ruleSuggestion); }
                }
                if (newSuggestionsAdded) {
                    cycleRulesSuggested += countAdded; // Update counter correctly
                    await this._savePendingSuggestions(); // Save after potentially adding new ones
                    this._onDidUpdatePendingSuggestions.fire(); // Notify UI
                }
            }
            
        } catch (taskError) {
            // This catches errors *during* the executeTask call itself (e.g., network error, AI service error)
            console.error(`AI Autonomy cycle: Error during execution call for task ${task.metadata.id}:`, taskError);
            // Mark the task as blocked because execution failed
            try {
                 await taskController.updateTaskStatus(this._extensionContext, task.metadata.id, 'blocked');
                 console.warn(`AI Autonomy cycle: Marked task ${task.metadata.id} as blocked due to execution error.`);
            } catch (updateError) {
                 console.error(`AI Autonomy cycle: Failed to mark task ${task.metadata.id} as blocked after execution error:`, updateError);
            }
        }
      }
      
      console.log('AI Autonomy cycle finished.')

    } catch (error) {
      console.error('Error during AI Autonomy cycle:', error)
      // Show error message to user?
      vscode.window.showErrorMessage(`AI Autonomy cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this._isProcessing = false
      this._autonomousCycleRunningEmitter.fire(false)
      this._updateStatusBar()
    }
    
    return {
      tasksCompleted: cycleTasksCompleted,
      tasksCreated: cycleTasksCreated,
      rulesGenerated: cycleRulesSuggested // Return suggested count
    }
  }
  
  // --- Persistence Methods --- 
  
  private _loadPendingSuggestions(): void {
      // Use workspaceState as suggestions are likely workspace-specific
      const stored = this._extensionContext.workspaceState.get<SuggestedRule[]>('cursorules.aiPendingRuleSuggestions', []);
      // Basic validation
      if (Array.isArray(stored) && stored.every(s => typeof s.title === 'string' && typeof s.content === 'string')) {
           this._pendingRuleSuggestions = stored;
           console.log(`AI Autonomy Service: Loaded ${this._pendingRuleSuggestions.length} pending rule suggestions from workspace state.`);
      } else {
          console.warn('AI Autonomy Service: Discarded invalid pending suggestions data from workspace state.');
           this._pendingRuleSuggestions = [];
           // Clear potentially corrupt state
           this._extensionContext.workspaceState.update('cursorules.aiPendingRuleSuggestions', undefined);
      }
      // No need to fire event on load usually, UI will fetch on activation
  }

  private async _savePendingSuggestions(): Promise<void> {
      try {
          // Use workspaceState
          await this._extensionContext.workspaceState.update('cursorules.aiPendingRuleSuggestions', this._pendingRuleSuggestions);
          console.log(`AI Autonomy Service: Saved ${this._pendingRuleSuggestions.length} pending rule suggestions to workspace state.`);
      } catch (error) {
          console.error("AI Autonomy Service: Failed to save pending suggestions:", error);
          vscode.window.showErrorMessage('Failed to save pending AI rule suggestions.');
      }
  }
  
  /**
   * Disposes resources used by this service
   */
  dispose(): void {
    this._stopProcessingInterval()
    if (this._statusBarItem) {
      this._statusBarItem.dispose()
    }
  }
} 