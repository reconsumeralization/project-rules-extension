import * as vscode from 'vscode'
import * as path from 'path'
import { Rule, createRuleFromFileContent, RuleSuggestion, RuleMetadata } from '../models/rule'
import * as localStorageService from '../services/localStorageService'
import * as syncController from './syncController'
import * as aiService from '../services/aiService'
import { ServerService } from '../services/serverService'
import { debounce, getBaseFilename, getProjectContextSummary, extractReferencedFiles } from '../utils'
import { error } from 'console'
import { readFileContent, getRuleUri } from '../services/localStorageService'
import * as minimatch from 'minimatch'
// Import ServerService later when needed
// import * as serverService from '../services/serverService';

// --- Constants ---
const RULE_EXTENSION = '.mdc'
const DELETED_RULES_QUEUE_KEY = 'deletedRuleIdsToSync'
const SYNC_DEBOUNCE_DELAY = 1500 // 1.5 seconds delay for sync trigger
const DEFAULT_RULE_SYNC_STATUS = 'local-only'
const ERROR_RETRY_LIMIT = 3
const MAX_BATCH_SIZE = 20

// --- Module State ---

// Holds the current set of rules managed by the controller
let rulesMap = new Map<string, Rule>()
// Emitter to notify subscribers (like the view) when rules change
const onRulesDidChangeEmitter = new vscode.EventEmitter<void>()
let serverServiceInstance: ServerService | null = null; // Add instance holder

// Create debounced version of syncRules
// Note: We need to ensure the context passed to syncRules is the correct, current one.
// Creating the debounced function here means it captures the initial context passed to the controller.
// If context can change or become invalid, this might need adjustment.
// For now, assuming context remains valid for the extension lifetime.
let debouncedSync: ((context: vscode.ExtensionContext) => void) | null = null;

// --- Private Helper Functions ---

function getRuleIdFromUri(uri: vscode.Uri): string {
    const filename = path.basename(uri.fsPath)
    return path.basename(filename, RULE_EXTENSION)
}

function getDefaultRuleTemplate(name: string): string {
  return `# ${name} Rule

This rule provides guidance for working with ${name}.

## Guidelines

1.  Guideline 1...
2.  Guideline 2...
3.  Guideline 3...

Applies to: **/*.ts, **/*.tsx
Referenced files: @file path/to/relevant/example.ts
`
}

/**
 * Safely extracts error message from any error type.
 */
function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Standardized error handling for rule operations.
 * This provides consistent error logging and optionally shows user notifications.
 * 
 * @param operation - Description of the operation that failed
 * @param error - The error that occurred
 * @param ruleId - Optional rule ID for context
 * @param showNotification - Whether to show a notification to the user
 * @param notificationMsg - Optional custom message for the notification
 * @returns The formatted error message
 */
function handleRuleError(
    operation: string,
    error: unknown,
    ruleId?: string,
    showNotification: boolean = false,
    notificationMsg?: string
): string {
    const message = getErrorMessage(error);
    const ruleContext = ruleId ? ` for rule ${ruleId}` : '';
    const logMessage = `RuleController: Error ${operation}${ruleContext}: ${message}`;
    
    console.error(logMessage, error);
    
    if (showNotification) {
        const userMsg = notificationMsg || `Failed to ${operation}${ruleContext}: ${message}`;
        vscode.window.showErrorMessage(userMsg);
    }
    
    return message;
}

/**
 * Updates a rule in the internal map and fires the change event.
 * Exported for use by syncController during batch updates.
 */
export function updateRuleInMap(rule: Rule | undefined): void {
    if (!rule) return
    rulesMap.set(rule.metadata.id, rule)
    onRulesDidChangeEmitter.fire()
}

function removeRuleFromMap(ruleId: string): void {
    if (rulesMap.delete(ruleId)) {
        onRulesDidChangeEmitter.fire()
    }
}

/**
 * Safely loads content from a file URI with error handling.
 */
async function safelyReadFile(uri: vscode.Uri): Promise<{ content: string, stats: vscode.FileStat } | null> {
    try {
        const contentBytes = await vscode.workspace.fs.readFile(uri)
        const content = Buffer.from(contentBytes).toString('utf8')
        const stats = await vscode.workspace.fs.stat(uri)
        return { content, stats }
    } catch (error) {
        console.error(`RuleController: Error reading file ${uri.fsPath}:`, error)
        return null
    }
}

/**
 * Queues a rule for server deletion with proper error handling.
 * 
 * This function is responsible for:
 * 1. Recording rules that need to be deleted from the server in extension storage
 * 2. Updating the in-memory tracking in the sync controller
 * 3. Ensuring no duplicate entries are created in the queue
 * 
 * @param context - The extension context providing access to global state storage
 * @param ruleId - The unique ID of the rule to be deleted from the server
 * @returns Promise resolving to true if successfully queued, false if an error occurred
 */
async function queueRuleForServerDeletion(context: vscode.ExtensionContext, ruleId: string): Promise<boolean> {
    if (!ruleId || typeof ruleId !== 'string') {
        console.error('RuleController: Invalid rule ID provided to queueRuleForServerDeletion');
        return false;
    }
    
    try {
        // Check if already queued to avoid duplicates
        const currentQueue = context.globalState.get<string[]>(DELETED_RULES_QUEUE_KEY, [])
        if (currentQueue.includes(ruleId)) {
            console.log(`RuleController: Rule ${ruleId} was already queued for server deletion.`)
            return true
        }
        
        // Update local extension storage queue
        const updatedQueue = [...currentQueue, ruleId]
        await context.globalState.update(DELETED_RULES_QUEUE_KEY, updatedQueue)
        console.log(`RuleController: Rule ${ruleId} queued for server deletion in extension storage.`)
        
        // Also update the sync controller's in-memory tracking
        // This ensures both systems stay in sync
        try {
            await syncController.queueRuleForServerDeletion(context, ruleId)
            console.log(`RuleController: Successfully queued rule ${ruleId} for server deletion.`)
            return true
        } catch (syncError) {
            // If sync controller update fails but we've already updated global state,
            // we consider this a partial success since the next sync will pick up the changes
            console.warn(`RuleController: Sync controller update failed for rule ${ruleId}, but global state was updated.`, syncError)
            return true
        }
    } catch (error) {
        // Comprehensive error logging
        console.error(`RuleController: Failed to queue rule ${ruleId} for server deletion:`, error)
        const message = error instanceof Error ? error.message : String(error)
        vscode.window.showErrorMessage(`Failed to queue rule for server deletion: ${message}. The rule will remain on the server until you try again.`)
        return false
    }
}

// --- Public Controller Functions ---

/**
 * Initializes the RuleController by loading rules from local storage.
 * Should be called once during extension activation.
 */
export async function initializeRuleController(context: vscode.ExtensionContext): Promise<void> {
  console.log('Initializing RuleController...')

  // Initialize the debounced function here, capturing the context
  debouncedSync = debounce((ctx: vscode.ExtensionContext) => {
      console.log('RuleController: Debounced sync triggered.')
      syncController.syncRules(ctx).catch(error => {
          console.error('RuleController: Error in debounced sync call:', getErrorMessage(error))
      })
  }, SYNC_DEBOUNCE_DELAY)

  try {
      const loadedRules = await localStorageService.loadRules(context)
      rulesMap = new Map(loadedRules.map((rule) => [rule.metadata.id, rule]))
      console.log(`Initialized RuleController with ${rulesMap.size} rules.`)
      onRulesDidChangeEmitter.fire() // Notify initial load
  } catch (error) {
      console.error('RuleController: Error initializing rules:', getErrorMessage(error))
      vscode.window.showErrorMessage(`Failed to initialize rules: ${getErrorMessage(error)}`)
      rulesMap.clear()
      onRulesDidChangeEmitter.fire() // Still notify so UI shows empty state
  }
}

/**
 * Event that fires when the rules managed by the controller change.
 */
export const onRulesDidChange: vscode.Event<void> = onRulesDidChangeEmitter.event

/**
 * Gets the current list of all rules.
 */
export function getRules(): Rule[] {
  return Array.from(rulesMap.values())
}

/**
 * Gets a specific rule by its ID.
 */
export function getRuleById(ruleId: string): Rule | undefined {
    return rulesMap.get(ruleId)
}

/**
 * Gets a rule by its filename.
 * Useful for file system operations where we have the filename but not the ID.
 * 
 * @param filename - The filename of the rule to retrieve
 * @returns The rule matching the filename, or undefined if not found
 */
export function getRuleByFilename(filename: string): Rule | undefined {
    // Ensure we're comparing just the basename in case a full path is provided
    const baseName = path.basename(filename);
    
    // Search through the rules for a matching filename
    for (const rule of rulesMap.values()) {
        if (rule.metadata.filename === baseName) {
            return rule;
        }
    }
    
    // No matching rule found
    return undefined;
}

/**
 * Prompts the user for a filename, creates a new rule file with default content,
 * saves it, updates the internal state, and opens the file for editing.
 */
export async function createNewRule(context: vscode.ExtensionContext): Promise<Rule | undefined> {
  const filenameInput = await vscode.window.showInputBox({
    prompt: 'Enter rule filename (e.g., react-component-structure)',
    placeHolder: 'my-new-rule',
    validateInput: (input) => {
      if (!input) {return 'Filename is required.'}
      if (!/^[a-z0-9-]+$/.test(input))
        {return 'Filename can only contain lowercase letters, numbers, and hyphens.'}
      if (rulesMap.has(input))
        {return `Rule "${input}${RULE_EXTENSION}" already exists.`}
      return null // Valid
    },
  })

  if (!filenameInput) {return undefined} // User cancelled

  const ruleId = filenameInput
  const filename = `${filenameInput}${RULE_EXTENSION}`
  const ruleContent = getDefaultRuleTemplate(filenameInput)

  // Create the initial Rule object
  const initialRule = createRuleFromFileContent({
      id: ruleId,
      filename: filename,
      content: ruleContent
      // syncStatus defaults to 'local-only'
  })

  // Save using the service
  const saveResult = await localStorageService.saveRule(context, initialRule)
  if (!saveResult) {
      // Error message already shown by service
      return undefined
  }

  // Create the final Rule object with potentially updated syncStatus from saveResult
   const savedRule = createRuleFromFileContent({
      id: ruleId,
      filename: filename,
      content: ruleContent,
      syncStatus: saveResult.syncStatus
  })


  // Update in-memory state
  updateRuleInMap(savedRule)

  // Open the newly created rule file for editing
  await openRuleForEditing(context, ruleId)

  vscode.window.showInformationMessage(`Created rule: ${filename}`)
  return savedRule
}

/**
 * Opens the specified rule file in the editor.
 */
export async function openRuleForEditing(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
  const rule = rulesMap.get(ruleId)
  if (!rule) {
    vscode.window.showWarningMessage(`Rule with ID "${ruleId}" not found.`)
    return
  }

  const uri = await localStorageService.getRuleUri(context, rule.metadata.filename)
  if (uri) {
    try {
        const document = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(document, { preview: false })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error opening rule file "${rule.metadata.filename}": ${message}`);
    }
  } else {
      vscode.window.showErrorMessage(`Could not find file for rule "${rule.metadata.filename}". It might have been deleted externally.`)
      // Optionally, remove the rule from the map if the file is confirmed missing
      // removeRuleFromMap(ruleId);
  }
}

/**
 * Deletes a rule by ID, asking for confirmation first
 * This will delete the rule locally and queue it for server deletion if it has a serverId
 */
export async function deleteRule(context: vscode.ExtensionContext, ruleId: string): Promise<boolean> {
  // Always verify the rule exists first
  const rule = rulesMap.get(ruleId);
  if (!rule) {
    vscode.window.showErrorMessage(`Rule with ID ${ruleId} not found or has already been deleted.`);
    return false;
  }

  try {
    // Get the rule filename for user messaging
    const filename = rule.metadata.filename;
    
    // Remove the rule from local map
    console.log(`Deleting rule with ID ${ruleId}...`);
    removeRuleFromMap(ruleId);

    // Delete the rule file using localStorageService
    const fileDeleted = await localStorageService.deleteRule(context, filename);
    if (!fileDeleted) {
      console.warn(`Warning: Could not delete rule file for ${filename}`);
      vscode.window.showWarningMessage(`Warning: The rule was removed from memory but the file may still exist.`);
    } else {
      console.log(`Deleted rule file: ${filename}`);
    }

    // If the rule has synced status, queue it for server deletion
    if (rule.metadata.syncStatus === 'synced') {
      queueRuleForServerDeletion(context, ruleId);
      vscode.window.showInformationMessage(`Rule "${rule.metadata.description || filename}" has been deleted locally and will be removed from server on next sync.`);
    } else {
      vscode.window.showInformationMessage(`Rule "${rule.metadata.description || filename}" has been deleted.`);
    }

    return true;
  } catch (error: any) {
    console.error(`Error deleting rule: ${error}`);
    vscode.window.showErrorMessage(`Failed to delete rule: ${error.message}`);
    return false;
  }
}

/**
 * Retrieves suggestions for improving a specific rule using the AI service
 * and displays them to the user. Includes content from referenced files and active editor.
 */
export async function suggestImprovementsForRule(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
    if (!serverServiceInstance) {
        vscode.window.showErrorMessage('Cannot get suggestions: Server connection not available.');
        console.error('RuleController: ServerService instance not set.');
        return;
    }

    const rule = rulesMap.get(ruleId);
    if (!rule) {
        vscode.window.showWarningMessage(`Cannot get suggestions: Rule "${ruleId}" not found.`);
        return;
    }

    let suggestions: RuleSuggestion[] = []; // Declare suggestions outside the progress scope

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Getting AI suggestions for rule: ${ruleId}`,
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: "Gathering context..." });
        let ruleContent: string | undefined;
        const referencedFiles: { [filePath: string]: string } = {};
        let activeFileContext: { filePath: string; content: string } | undefined;
        let projectContext: Awaited<ReturnType<typeof getProjectContextSummary>> | null = null; // Initialize projectContext

        try {
            // 1. Get Rule Content
            const currentRule = getRuleById(ruleId); // Use a different variable name to avoid shadowing
            if (currentRule) {
                ruleContent = currentRule.content;
            } else {
                // Try reading from file if not in memory (edge case)
                const ruleUri = await getRuleUri(context, `${ruleId}${RULE_EXTENSION}`); 
                if (ruleUri) {
                    ruleContent = await readFileContent(ruleUri); // Use imported function
                } else {
                    throw new Error(`Rule file for ID ${ruleId} not found.`);
                }
            }
            progress.report({ increment: 20, message: "Analyzing references..." });

            // 2. Get Referenced Files Content (using existing logic)
            // Use the newly implemented function from utils
            const references = extractReferencedFiles(ruleContent || ''); 
            
            for (const refPath of references) {
                // Use workspaceFolders[0].uri as the base for resolving relative paths
                const workspaceFolderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!workspaceFolderUri) {
                    console.warn('Cannot resolve relative reference path, no workspace folder open.');
                    continue; // Skip this reference if no workspace
                }
                const fileUri = vscode.Uri.joinPath(workspaceFolderUri, refPath);
                try {
                    const content = await readFileContent(fileUri); // Use imported function
                    // Handle case where readFileContent returns undefined (e.g., file not found)
                    if (content !== undefined) {
                        referencedFiles[refPath] = content;
                    } else {
                         console.warn(`Could not read referenced file ${refPath}: File not found or empty.`);
                         referencedFiles[refPath] = `Error: File not found or empty.`; // Include error in context
                    }
                } catch (err: any) {
                    console.warn(`Could not read referenced file ${refPath}: ${err.message}`);
                    referencedFiles[refPath] = `Error reading file: ${err.message}`; // Include error in context
                }
            }
            progress.report({ increment: 20, message: "Getting active file context..." });

            // 3. Get Active File Context (if different from rule file)
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && getBaseFilename(activeEditor.document.fileName) !== ruleId) { // Use imported function
                activeFileContext = {
                    filePath: vscode.workspace.asRelativePath(activeEditor.document.uri),
                    content: activeEditor.document.getText()
                };
            }
             progress.report({ increment: 20, message: "Gathering project context..." });

            // 4. Get Project Context
             projectContext = await getProjectContextSummary();

            progress.report({ increment: 20, message: "Sending request to AI..." });

            // Prepare payload
            const contextPayload = {
                ruleContent,
                referencedFiles: Object.keys(referencedFiles).length > 0 ? referencedFiles : undefined,
                activeFileContext,
                projectContext: projectContext ? {
                    rootDirs: projectContext.rootDirs,
                    dependencies: projectContext.dependencies,
                    devDependencies: projectContext.devDependencies
                } : undefined,
            };

            console.log("RuleController: Preparing to send context payload:", JSON.stringify(contextPayload, null, 2));

            // Call server service - Assign result to the outer suggestions variable
            suggestions = await serverServiceInstance!.suggestImprovements(ruleId, contextPayload);

            progress.report({ increment: 20, message: "Suggestions received." });

        } catch (error: any) {
            console.error("Error getting suggestions:", error);
            vscode.window.showErrorMessage(`Failed to get suggestions: ${error.message}`);
            suggestions = []; // Ensure suggestions is an empty array on error
        }
    });

    if (!suggestions || suggestions.length === 0) {
        // Use the original rule variable which is accessible here
        vscode.window.showInformationMessage(`No improvement suggestions found for rule "${rule.metadata.filename}".`);
        return;
    }

    // --- Display Suggestions (Example: Show in Output Channel or Information Message) ---

    // Option 2: Output Channel (better for detailed suggestions)
    const outputChannel = vscode.window.createOutputChannel(`Cursor Rule Suggestions: ${rule.metadata.filename}`);
    outputChannel.clear();
    outputChannel.appendLine(`AI Suggestions for Rule: ${rule.metadata.filename} (ID: ${ruleId})\n`);

    suggestions.forEach((suggestion: RuleSuggestion, index: number) => { // Add explicit types
        outputChannel.appendLine(`--- Suggestion ${index + 1} (${suggestion.type} in ${suggestion.section}) ---`);
        outputChannel.appendLine(`Explanation: ${suggestion.explanation}`);
        outputChannel.appendLine(`Content:\n${suggestion.content}\n`);
    });

    outputChannel.show(true); // Show the output channel

    vscode.window.showInformationMessage(`Displayed ${suggestions.length} suggestions in the output channel.`);
}

/**
 * Updates a local rule file and in-memory state based on data received from the server.
 * 
 * This function is a critical part of the synchronization process. It's called when:
 * 1. New rules are downloaded from the server during sync
 * 2. Existing rules are updated with newer server versions
 * 3. Conflict resolution chooses the server version
 * 
 * The function ensures the rule is properly marked as synced and handles 
 * potential errors during the save operation.
 * 
 * @param context - The extension context for local storage operations
 * @param serverRule - The rule data received from the server
 * @returns Promise that resolves when the update operation completes
 * @throws May throw errors if the save operation fails critically
 */
export async function updateRuleFromServer(context: vscode.ExtensionContext, serverRule: Rule): Promise<void> {
    // Input validation
    if (!serverRule?.metadata?.id || !serverRule?.metadata?.filename || !serverRule?.content) {
        console.error('RuleController: Attempted to update rule from server with invalid data:', serverRule);
        throw new Error('Invalid server rule data: Missing required metadata (id, filename) or content');
    }

    if (!context) {
        console.error('RuleController: Missing extension context for updating rule from server');
        throw new Error('Extension context is required for rule updates');
    }

    const ruleId = serverRule.metadata.id;
    console.log(`RuleController: Updating rule ${ruleId} (${serverRule.metadata.filename}) from server`);
    
    try {
        // Get the current local version if it exists
        const localRule = rulesMap.get(ruleId);
        
        // Check if update is necessary by comparing versions
        if (localRule) {
            const contentUnchanged = localRule.content === serverRule.content;
            const timestampUnchanged = localRule.metadata.lastModified === serverRule.metadata.lastModified;
            const alreadySynced = localRule.metadata.syncStatus === 'synced';
            
            if (contentUnchanged && timestampUnchanged && alreadySynced) {
                console.log(`RuleController: Rule ${ruleId} is already up-to-date with server version`);
                return;
            }
            
            console.log(`RuleController: Server version of rule ${ruleId} differs from local version, updating...`);
        } else {
            console.log(`RuleController: Adding new rule ${ruleId} from server`);
        }
        
        // Always ensure the rule from the server is marked as synced
        const ruleToSave: Rule = {
            ...serverRule,
            metadata: {
                ...serverRule.metadata,
                syncStatus: 'synced'
            }
        };
        
        // Save to local storage
        const saveResult = await localStorageService.saveRule(context, ruleToSave);
        
        if (saveResult) {
            // Saving the file triggers onDidSaveTextDocument → handleRuleFileSaved → rulesMap update
            console.log(`RuleController: Successfully saved server update for rule ${ruleId}`);
            
            // In some cases, the file watcher might not catch the change, so manually update map as backup
            updateRuleInMap(ruleToSave);
        } else {
            // Handle save failures
            throw new Error(`Failed to save server update for rule ${ruleId}`);
        }
    } catch (error) {
        // Handle errors during the update process
        const message = error instanceof Error ? error.message : String(error);
        console.error(`RuleController: Error updating rule ${ruleId} from server:`, error);
        
        // Mark as conflict if we have a local version to ensure the user knows there's an issue
        const localRule = rulesMap.get(ruleId);
        if (localRule) {
            try {
                await markRuleAsConflict(context, ruleId);
                vscode.window.showWarningMessage(
                    `Failed to save server update for "${serverRule.metadata.filename}". ` +
                    `The rule has been marked as conflicted. Please resolve the conflict manually.`
                );
            } catch (conflictError) {
                console.error(`RuleController: Failed to mark rule ${ruleId} as conflict after update error:`, conflictError);
                vscode.window.showErrorMessage(
                    `Failed to update rule "${serverRule.metadata.filename}" from server and could not mark as conflict. ` +
                    `You may need to manually refresh or restart to resolve the issue.`
                );
            }
        } else {
            vscode.window.showErrorMessage(`Failed to save new rule "${serverRule.metadata.filename}" from server: ${message}`);
        }
        
        // Rethrow for upstream handling if needed
        throw new Error(`Failed to update rule ${ruleId} from server: ${message}`);
    }
}

/**
 * Marks a rule as conflicted when local and server versions differ.
 * 
 * This function is called during sync when a conflict is detected but the user
 * chooses to mark the conflict for later resolution rather than immediately
 * choosing between versions or creating a renamed copy.
 * 
 * It creates a new rule object with updated status while preserving the original 
 * local content, writes it to disk, and updates the internal tracking map.
 * 
 * @param context - The extension context
 * @param ruleId - The unique identifier of the rule to mark as conflicted
 * @param preserveLocalContent - Whether to keep local content (true) or use server content (false)
 * @returns Promise resolving to the updated rule, or undefined if the operation failed
 */
export async function markRuleAsConflict(
    context: vscode.ExtensionContext,
    ruleId: string, 
    preserveLocalContent: boolean = true
): Promise<Rule | undefined> {
    if (!ruleId) {
        console.error('RuleController: Called markRuleAsConflict with invalid rule ID');
        return undefined;
    }
    
    console.log(`RuleController: Marking rule ${ruleId} as conflict (preserveLocalContent: ${preserveLocalContent})`);
    
    try {
        const oldRule = rulesMap.get(ruleId);
        if (!oldRule) {
            console.warn(`RuleController: Cannot mark non-existent rule ${ruleId} as conflict`);
            return undefined;
        }
        
        // Create a modified rule with the conflict status
        const updatedRule = createRuleFromFileContent({
            id: ruleId,
            filename: oldRule.metadata.filename,
            content: oldRule.content,
            lastModified: Date.now(), // Current timestamp
            syncStatus: 'conflict'
        });
        
        // Get file URI
        const ruleUri = await getRuleUri(context, updatedRule.metadata.filename);
        if (!ruleUri) {
            throw new Error(`Could not generate URI for rule ${ruleId}`);
        }
        
        console.log(`RuleController: Writing conflicted rule to ${ruleUri.fsPath}`);
        
        try {
            // Write the content to the file
            await vscode.workspace.fs.writeFile(
                ruleUri,
                Buffer.from(updatedRule.content, 'utf8')
            );
            
            // Update in memory
            rulesMap.set(ruleId, updatedRule);
            
            // Trigger UI update for the conflict badge counts
            onRulesDidChangeEmitter.fire();
            
            console.log(`RuleController: Successfully marked rule ${ruleId} as conflict`);
            return updatedRule;
        } catch (writeError) {
            handleRuleError(
                'writing conflicted rule to disk',
                writeError,
                ruleId,
                true,
                `Failed to mark rule as conflicted: Error writing to ${ruleUri.fsPath}. The rule may be inconsistent between local and server.`
            );
            return undefined;
        }
    } catch (error) {
        handleRuleError(
            'marking rule as conflict',
            error,
            ruleId,
            true
        );
        return undefined;
    }
}

/**
 * Handles the event when a rule file is saved.
 * 
 * This function is triggered whenever a rule file is saved, either:
 * 1. By user editing and saving the file
 * 2. By programmatic saves during sync or other operations
 * 
 * It updates the rule content and metadata in the internal map and potentially
 * triggers a sync operation if the save changed a previously synced rule.
 * 
 * @param context - The extension context for potential sync operations
 * @param uri - The VS Code URI of the saved file
 * @returns Promise that resolves when all handling is complete
 */
export async function handleRuleFileSaved(context: vscode.ExtensionContext, uri: vscode.Uri): Promise<void> {
    if (!uri) {
        console.error('RuleController: Called handleRuleFileSaved with invalid URI');
        return;
    }
    
    const ruleId = getRuleIdFromUri(uri);
    console.log(`RuleController: Handling save for rule file: ${uri.fsPath} (ID: ${ruleId})`);
    
    try {
        // Use the safe file read helper to get content and stats
        const fileData = await safelyReadFile(uri);
        if (!fileData) {
            throw new Error(`Could not read saved file: ${uri.fsPath}`);
        }
        
        const { content, stats } = fileData;
        const oldRule = rulesMap.get(ruleId);
        const oldSyncStatus = oldRule?.metadata?.syncStatus || DEFAULT_RULE_SYNC_STATUS;
        
        // Determine the appropriate sync status for the updated rule
        let newSyncStatus = oldSyncStatus;
        
        // If previously synced or in conflict, a local edit should change to local-only
        // unless the save was part of a server update operation
        if ((oldSyncStatus === 'synced' || oldSyncStatus === 'conflict')) {
            // Check if content actually changed (some editors trigger save without changes)
            const contentChanged = !oldRule || oldRule.content !== content;
            
            if (contentChanged) {
                newSyncStatus = 'local-only';
                console.log(`RuleController: Rule ${ruleId} changed from ${oldSyncStatus} to local-only due to content changes`);
            }
        }
        
        // Create the updated rule with new content and metadata
        const updatedRule = createRuleFromFileContent({
            id: ruleId,
            filename: path.basename(uri.fsPath),
            content: content,
            lastModified: stats.mtime,
            syncStatus: newSyncStatus
        });
        
        // Update the rule in memory and notify the UI
        updateRuleInMap(updatedRule);
        
        // Track changes that need sync
        const syncStatusChanged = oldSyncStatus !== newSyncStatus;
        const becameLocalOnly = newSyncStatus === 'local-only' && oldSyncStatus !== 'local-only';
        
        // Trigger sync if the rule became local-only (needs upload to server)
        if (becameLocalOnly && debouncedSync) {
            console.log(`RuleController: Queuing debounced sync after save for rule ${ruleId}`);
            debouncedSync(context);
        } else if (syncStatusChanged) {
            console.log(`RuleController: Rule ${ruleId} sync status changed to ${newSyncStatus}, but no sync triggered`);
        }
    } catch (error) {
        // Handle any errors during the save handling process
        const message = error instanceof Error ? error.message : String(error);
        console.error(`RuleController: Error handling saved rule file ${uri.fsPath}:`, error);
        
        // Don't show UI errors for every failure as this can get noisy for users
        // Only show critical errors that would impact their workflow
        if (message.includes('Could not read saved file')) {
            vscode.window.showWarningMessage(
                `Failed to process saved rule file. Changes may not be tracked properly for sync. ` +
                `Try saving again or restart VS Code if the issue persists.`
            );
        }
    }
}

/**
 * Handles the event when a rule file is deleted from the filesystem.
 * 
 * This function is called when:
 * 1. A rule file is manually deleted by the user
 * 2. A rule file is programmatically deleted during sync
 * 3. A file watcher detects a deleted file
 * 
 * It removes the rule from the internal tracking map and, if the rule was
 * previously synced with the server, queues it for deletion from the server
 * during the next sync operation.
 * 
 * @param uri - The VS Code URI of the deleted file
 * @param extensionContext - Optional context needed for queueing server deletion
 * @returns Promise that resolves when all handling is complete
 */
export async function handleRuleFileDeleted(uri: vscode.Uri, extensionContext?: vscode.ExtensionContext): Promise<void> {
    if (!uri) {
        console.error('RuleController: Called handleRuleFileDeleted with invalid URI');
        return;
    }
    
    const filename = path.basename(uri.fsPath);
    const ruleId = getRuleIdFromUri(uri);
    console.log(`RuleController: Processing deletion for rule file: ${uri.fsPath} (ID: ${ruleId})`);
    
    try {
        // Check if this rule is being tracked in memory - try both by ID and filename
        let rule = rulesMap.get(ruleId);
        if (!rule) {
            rule = getRuleByFilename(filename);
        }
        
        if (!rule) {
            console.log(`RuleController: Ignoring delete event for untracked file ${uri.fsPath}`);
            return;
        }
        
        // Double-check the file is actually gone to avoid race conditions
        // where the file might have been recreated after deletion
        try {
            await vscode.workspace.fs.stat(uri);
            console.log(`RuleController: File ${uri.fsPath} still exists, might be a race condition. Ignoring delete event.`);
            return;
        } catch (statError) {
            // File is indeed gone, continue with deletion handling
            if (!(statError instanceof vscode.FileSystemError && statError.code === 'FileNotFound')) {
                // If it's not a FileNotFound error, log it but continue processing the deletion
                console.warn(`RuleController: Unexpected error checking file existence:`, statError);
            }
        }
        
        // Record the sync status before removing from map for use in server deletion logic
        const wasOnServer = rule.metadata.syncStatus === 'synced' || rule.metadata.syncStatus === 'conflict';
        const ruleName = rule.metadata.filename;
        const ruleIdToDelete = rule.metadata.id;
        
        // Remove rule from in-memory tracking and notify UI
        removeRuleFromMap(ruleIdToDelete);
        console.log(`RuleController: Removed rule "${ruleName}" from internal map`);
        
        // If we don't have the extension context, we can't handle server-side deletion
        if (!extensionContext) {
            console.warn(`RuleController: No extension context provided, skipping server deletion queueing for ${ruleIdToDelete}`);
            return;
        }
        
        // Queue for server deletion if it was previously synced
        if (wasOnServer) {
            try {
                const queueSuccess = await queueRuleForServerDeletion(extensionContext, ruleIdToDelete);
                
                if (queueSuccess) {
                    console.log(`RuleController: Successfully queued rule ${ruleIdToDelete} for server deletion`);
                } else {
                    console.warn(`RuleController: Failed to queue rule ${ruleIdToDelete} for server deletion`);
                    // Don't show UI message here, as the queueRuleForServerDeletion function already does that
                }
            } catch (error) {
                handleRuleError(
                    'queue rule for server deletion',
                    error,
                    ruleIdToDelete,
                    true,
                    `Failed to queue rule for server deletion: ${getErrorMessage(error)}. The rule may remain on the server.`
                );
            }
        } else {
            console.log(`RuleController: Rule ${ruleIdToDelete} was not synced, no need to delete from server`);
        }
        
    } catch (error) {
        handleRuleError(
            'handle rule file deletion',
            error,
            ruleId,
            false  // Don't show UI errors for file system events to avoid noise
        );
    }
}

// Function to set the ServerService instance (if initialized externally)
export function setServerService(instance: ServerService): void {
    serverServiceInstance = instance;
} 

/**
 * Generates a new rule based on the content of a given file using the AI service.
 * Saves the generated rule and opens it for editing.
 */
export async function generateRuleFromFile(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<Rule | undefined> {
    if (!serverServiceInstance) {
        vscode.window.showErrorMessage('Cannot generate rule: Server connection not available.');
        console.error('RuleController: ServerService instance not set.');
        return undefined;
    }

    const filename = path.basename(fileUri.fsPath);
    let fileContent = '';

    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: `Generating Cursor Rule from ${filename}...`,
        cancellable: false
    };

    let generatedRule: Rule | undefined;

    await vscode.window.withProgress(progressOptions, async (progress) => {
        progress.report({ increment: 10, message: "Reading file content..." });
        try {
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            fileContent = Buffer.from(fileData).toString('utf8');
        } catch (error: any) {
            console.error(`RuleController: Error reading file ${fileUri.fsPath}:`, error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to read file content: ${message}`);
            throw error; // Stop progress
        }

        progress.report({ increment: 30, message: "Calling AI service..." });
        try {
            generatedRule = await serverServiceInstance!.generateRuleFromFile(filename, fileContent);
        } catch (error: any) {
            console.error(`RuleController: Error generating rule from file ${filename}:`, error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to generate rule via AI service: ${message}`);
            throw error; // Stop progress
        }

        if (!generatedRule?.metadata?.id || !generatedRule?.content) {
            console.error('RuleController: AI service returned invalid rule data.', generatedRule);
            vscode.window.showErrorMessage('AI service failed to generate a valid rule structure.');
            throw new Error('Invalid rule data received from AI service'); // Stop progress
        }

        // Ensure generated rule has correct filename and .mdc extension
        const expectedFilename = `${generatedRule.metadata.id}${RULE_EXTENSION}`;
        generatedRule = {
            ...generatedRule,
            metadata: {
                ...generatedRule.metadata,
                filename: expectedFilename,
                syncStatus: 'local-only' // New rule is initially local-only
            }
        };

        progress.report({ increment: 40, message: "Saving generated rule..." });
        try {
            const saveResult = await localStorageService.saveRule(context, generatedRule);
            if (!saveResult) {
                // Error message shown by service
                throw new Error('Failed to save the generated rule locally.'); // Stop progress
            }
            // Saving triggers handleRuleFileSaved, updating the map
             console.log(`RuleController: Saved generated rule ${generatedRule.metadata.filename}`);

        } catch (error: any) {
            console.error(`RuleController: Error saving generated rule ${generatedRule.metadata.filename}:`, error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to save generated rule: ${message}`);
            throw error; // Stop progress
        }

         progress.report({ increment: 20, message: "Rule generated successfully." });
    });

    if (generatedRule) {
        // Open the newly created rule file for editing
        await openRuleForEditing(context, generatedRule.metadata.id);
        vscode.window.showInformationMessage(`Generated rule: ${generatedRule.metadata.filename}`);
    }

    return generatedRule; // Return the rule if successful
}

/**
 * Creates a new rule programmatically without user interaction
 * Used by AI services to generate rules automatically
 * 
 * @param context The extension context
 * @param title The title of the rule
 * @param content The content of the rule
 * @param aiGenerated Whether this rule was generated by AI
 * @returns The ID of the created rule
 */
export async function createRuleProgrammatically(
    context: vscode.ExtensionContext,
    title: string,
    content: string,
    aiGenerated: boolean = true
): Promise<string> {
    if (!title || !content) {
        throw new Error('Title and content are required for creating a rule programmatically')
    }

    try {
        // Generate a unique ID for the rule
        const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        
        // Generate a valid filename
        const filename = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphens
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            + RULE_EXTENSION
        
        // Create the rule
        const rule = createRuleFromFileContent({
            id: ruleId,
            filename,
            content,
            syncStatus: DEFAULT_RULE_SYNC_STATUS
        })
        
        // Save the rule to local storage
        const saveResult = await localStorageService.saveRule(context, rule)
        if (!saveResult) {
            throw new Error('Failed to save programmatically created rule to local storage')
        }
        
        // Handle the saved file (updates map and notifies UI)
        await handleRuleFileSaved(context, saveResult.uri)

        // Log success
        console.log(`Created rule programmatically: ${title} (${ruleId})${aiGenerated ? ' via AI' : ''}`)
        
        return ruleId
    } catch (error) {
        console.error('Error creating rule programmatically:', error)
        const message = getErrorMessage(error)
        vscode.window.showErrorMessage(`Failed to create rule "${title}" programmatically: ${message}`)
        throw error // Re-throw to indicate failure to the caller
    }
}

/**
 * Demonstrates the AI service integration by generating a rule improvement suggestion
 */
export async function demonstrateAiServiceIntegration() {
  try {
    // Get the active text editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Please open a file to generate a rule suggestion.');
      return;
    }

    // Get the active file content
    const document = editor.document;
    const text = document.getText();
    const fileName = path.basename(document.fileName);

    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing file for rule suggestions...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 20, message: 'Contacting AI service...' });

        // Get extension exports to access ServerService
        const extension = vscode.extensions.getExtension('project-rules-extension');
        if (!extension) {
          throw new Error('Project Rules extension not available');
        }

        // Activate the extension if not already activated
        if (!extension.isActive) {
          await extension.activate();
        }

        // Get the server service
        const serverService = extension.exports.getServerService();
        if (!serverService) {
          throw new Error('ServerService not available from extension exports');
        }

        // Get extension context from the extension exports
        const extensionContext = extension.exports.getExtensionContext?.();
        if (!extensionContext) {
          throw new Error('Extension context not available from extension exports');
        }

        progress.report({ increment: 40, message: 'Generating suggestions...' });

        // Call the AI service
        const response = await serverService.callAIService({
          action: 'generateRuleSuggestion',
          data: {
            filename: fileName,
            fileContent: text,
            prompt: 'Analyze this file and suggest a project rule that could help maintain code quality or standards.'
          }
        });

        progress.report({ increment: 40, message: 'Processing response...' });

        if (!response.success) {
          throw new Error(`AI service error: ${response.error}`);
        }

        // Show the suggestion in an information message
        const suggestion = response.data?.suggestion || 'No suggestion available';
        
        // Show the result in a webview
        const panel = vscode.window.createWebviewPanel(
          'ruleAiSuggestion',
          'AI Rule Suggestion',
          vscode.ViewColumn.One,
          {
            enableScripts: true
          }
        );

        panel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Rule Suggestion</title>
            <style>
              body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
              }
              h1 {
                color: var(--vscode-editor-foreground);
              }
              pre {
                background-color: var(--vscode-editor-background);
                padding: 10px;
                border-radius: 5px;
                overflow: auto;
              }
              .suggestion {
                background-color: var(--vscode-editor-background);
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
                white-space: pre-wrap;
              }
              button {
                margin-top: 20px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 2px;
                cursor: pointer;
              }
              button:hover {
                background-color: var(--vscode-button-hoverBackground);
              }
            </style>
          </head>
          <body>
            <h1>AI Rule Suggestion for ${fileName}</h1>
            <p>The AI has analyzed your file and suggested the following rule:</p>
            
            <div class="suggestion">
              ${suggestion}
            </div>
            
            <button id="createRuleBtn">Create Rule from Suggestion</button>

            <script>
              const vscode = acquireVsCodeApi();
              document.getElementById('createRuleBtn').addEventListener('click', () => {
                vscode.postMessage({
                  command: 'createRule',
                  suggestion: ${JSON.stringify(suggestion)}
                });
              });
            </script>
          </body>
          </html>
        `;

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
          async (message) => {
            if (message.command === 'createRule') {
              try {
                // Extract the suggestion content
                const suggestion = message.suggestion;
                if (!suggestion) {
                  throw new Error('No suggestion content provided');
                }
                
                // Prompt user for rule title
                const title = await vscode.window.showInputBox({
                  prompt: 'Enter a title for the new rule',
                  placeHolder: 'my-ai-suggested-rule',
                  validateInput: (input) => {
                    if (!input) return 'Title is required';
                    if (!/^[a-z0-9-\s]+$/i.test(input))
                      return 'Title can only contain letters, numbers, spaces, and hyphens';
                    return null; // Valid
                  }
                });
                
                if (!title) {
                  // User cancelled the operation
                  return;
                }
                
                // Create rule using the programmatic creation method
                const ruleId = await createRuleProgrammatically(
                  extensionContext,
                  title,
                  suggestion,
                  true // Mark as AI-generated
                );
                
                if (ruleId) {
                  vscode.window.showInformationMessage(`Created rule "${title}" from AI suggestion`);
                  // Close the webview panel
                  panel.dispose();
                  // Open the newly created rule for editing
                  await openRuleForEditing(extensionContext, ruleId);
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to create rule from AI suggestion: ${message}`);
                console.error('Error creating rule from AI suggestion:', error);
              }
            }
          },
          undefined,
          []
        );
      }
    );
  } catch (error) {
    console.error('Error in demonstrateAiServiceIntegration:', error);
    vscode.window.showErrorMessage(`Failed to get AI rule suggestion: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export additional utility functions for testing if needed
export const __testing = {
    getErrorMessage,
    safelyReadFile,
    queueRuleForServerDeletion
}
