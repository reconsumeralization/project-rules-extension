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

// --- Public Controller Functions ---

/**
 * Initializes the RuleController by loading rules from local storage.
 * Should be called once during extension activation.
 */
export async function initializeRuleController(context: vscode.ExtensionContext): Promise<void> {
  // Initialize the debounced function here, capturing the context
  debouncedSync = debounce((ctx: vscode.ExtensionContext) => {
      console.log('RuleController: Debounced sync triggered.');
      syncController.syncRules(ctx).catch(error => {
            console.error('RuleController: Error in debounced sync call:', error);
            // Optionally show a user-facing error, but syncRules likely already did
        });
    }, SYNC_DEBOUNCE_DELAY);

  const loadedRules = await localStorageService.loadRules(context)
  rulesMap = new Map(loadedRules.map((rule) => [rule.metadata.id, rule]))
  console.log(`Initialized RuleController with ${rulesMap.size} rules.`)
  onRulesDidChangeEmitter.fire() // Notify initial load
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
 * Prompts the user for a filename, creates a new rule file with default content,
 * saves it, updates the internal state, and opens the file for editing.
 */
export async function createNewRule(context: vscode.ExtensionContext): Promise<Rule | undefined> {
  const filenameInput = await vscode.window.showInputBox({
    prompt: 'Enter rule filename (e.g., react-component-structure)',
    placeHolder: 'my-new-rule',
    validateInput: (input) => {
      if (!input) return 'Filename is required.'
      if (!/^[a-z0-9-]+$/.test(input))
        return 'Filename can only contain lowercase letters, numbers, and hyphens.'
      if (rulesMap.has(input))
        return `Rule "${input}${RULE_EXTENSION}" already exists.`
      return null // Valid
    },
  })

  if (!filenameInput) return undefined // User cancelled

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
 * Prompts for confirmation and deletes a rule by its ID.
 * If the rule was synced or conflicted, queues it for deletion on the server via global state.
 */
export async function deleteRule(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
  const rule = rulesMap.get(ruleId)
  if (!rule) {
    vscode.window.showWarningMessage(`Cannot delete: Rule with ID "${ruleId}" not found.`)
    return
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete the rule "${rule.metadata.filename}"? This cannot be undone.`,
    { modal: true },
    'Delete',
  )

  if (confirmation !== 'Delete') return
  
  const deletedLocally = await localStorageService.deleteRule(context, rule.metadata.filename)

  if (deletedLocally) {
    const oldSyncStatus = rule.metadata.syncStatus; // Store status before removing
    removeRuleFromMap(ruleId) // Remove from map and notify UI
    vscode.window.showInformationMessage(`Deleted rule: ${rule.metadata.filename}`)

    // Queue for server deletion if necessary
    if (oldSyncStatus === 'synced' || oldSyncStatus === 'conflict') {
        try {
            // Use the passed context to access globalState
            const currentQueue = context.globalState.get<string[]>(DELETED_RULES_QUEUE_KEY, []);
            if (!currentQueue.includes(ruleId)) {
                const updatedQueue = [...currentQueue, ruleId];
                await context.globalState.update(DELETED_RULES_QUEUE_KEY, updatedQueue);
                console.log(`RuleController: Rule ${ruleId} queued for server deletion via global state.`);
                
                // Trigger sync immediately after queuing with proper error handling
                console.log(`RuleController: Triggering sync after queuing ${ruleId} for deletion.`);
                try {
                    await syncController.syncRules(context);
                    // Sync completed successfully
                    vscode.window.showInformationMessage(`Rule "${rule.metadata.filename}" deleted and removed from server.`);
                } catch (syncError) {
                    console.error(`RuleController: Sync failed after deleting rule ${ruleId}:`, syncError);
                    vscode.window.showWarningMessage(
                        `Rule "${rule.metadata.filename}" deleted locally but server sync failed. ` +
                        `It will be removed from the server on the next successful sync.`
                    );
                }
            } else {
                 console.log(`RuleController: Rule ${ruleId} was already queued for server deletion.`);
            }
        } catch (error) {
            console.error(`RuleController: Failed to update globalState for deleted rule ${ruleId}:`, error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to queue rule for server deletion: ${message}. Please try syncing manually.`);
        }
    }
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
 * This is typically called after a sync operation.
 */
export async function updateRuleFromServer(context: vscode.ExtensionContext, serverRule: Rule): Promise<void> {
    if (!serverRule?.metadata?.id) {
        console.error('RuleController: Attempted to update rule from server with invalid data:', serverRule);
        return;
    }

    console.log(`RuleController: Updating rule ${serverRule.metadata.id} from server.`);
    const localRule = rulesMap.get(serverRule.metadata.id);

    // Check if server data is actually different before writing to avoid unnecessary file ops/events
    if (localRule && localRule.content === serverRule.content && localRule.metadata.lastModified === serverRule.metadata.lastModified && localRule.metadata.syncStatus === 'synced') {
        console.log(`RuleController: Rule ${serverRule.metadata.id} is already up-to-date with server version.`);
        return;
    }

    // Ensure the rule from the server is marked as synced
    const ruleToSave: Rule = {
        ...serverRule,
        metadata: {
            ...serverRule.metadata,
            syncStatus: 'synced'
        }
    };

    const saveResult = await localStorageService.saveRule(context, ruleToSave);
    if (saveResult) {
        // Saving the file should trigger onDidSaveTextDocument, which calls handleRuleFileSaved.
        // handleRuleFileSaved will update the rulesMap and fire the change event.
        // Therefore, we don't need to manually update the map here.
        console.log(`RuleController: Saved server update for rule ${serverRule.metadata.filename} to ${saveResult.uri.fsPath}`);
    } else {
        // Error saving the rule - localStorageService should have shown an error message
        console.error(`RuleController: Failed to save server update for rule ${serverRule.metadata.filename}`);
        // Mark the rule as conflicted if save fails - this ensures the user knows about the issue
        if (localRule) {
            await markRuleAsConflict(context, serverRule.metadata.id);
            vscode.window.showWarningMessage(
                `Failed to save server update for "${serverRule.metadata.filename}". ` +
                `The rule has been marked as conflicted. Please resolve the conflict manually.`
            );
        }
    }
}

/**
 * Marks a specific local rule as being in a 'conflict' state.
 * Updates the file metadata (indirectly via save) and in-memory state.
 */
export async function markRuleAsConflict(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
    const localRule = rulesMap.get(ruleId);
    if (!localRule) {
        console.warn(`RuleController: Cannot mark rule ${ruleId} as conflict: Rule not found locally.`);
        return;
    }

    // Avoid unnecessary updates if already marked as conflict
    if (localRule.metadata.syncStatus === 'conflict') {
        console.log(`RuleController: Rule ${ruleId} is already marked as conflict.`);
        return;
    }

    console.log(`RuleController: Marking rule ${ruleId} as conflict.`);

    // Create a new rule object with updated status but keep local content
    const conflictedRule = createRuleFromFileContent({
        id: localRule.metadata.id,
        filename: localRule.metadata.filename,
        content: localRule.content, // Keep existing content
        lastModified: localRule.metadata.lastModified, // Keep existing timestamp
        syncStatus: 'conflict' // Set the conflict status
    });

    const saveResult = await localStorageService.saveRule(context, conflictedRule);
    if (saveResult) {
        // As above, saving should trigger handleRuleFileSaved to update the map and UI
        console.log(`RuleController: Saved conflict state for rule ${conflictedRule.metadata.filename}`);
    } else {
        console.error(`RuleController: Failed to save conflicted rule ${ruleId} locally.`);
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error saving rule with conflict status: ${message}. File might be read-only.`);
    }
}

// --- File Watcher Handlers ---

/**
 * Handles the event when a rule file is saved.
 * Updates the rule content and metadata in the internal map.
 * Triggers a sync if the save resulted in a change requiring it (debounced).
 */
export async function handleRuleFileSaved(context: vscode.ExtensionContext, uri: vscode.Uri): Promise<void> {
  const ruleId = getRuleIdFromUri(uri);
  console.log(`RuleController: Handling save for rule file: ${uri.fsPath} (ID: ${ruleId})`);

  try {
    const contentBytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(contentBytes).toString('utf8');
    const stats = await vscode.workspace.fs.stat(uri); // Get modification time

    const oldRule = rulesMap.get(ruleId);
    const oldSyncStatus = oldRule?.metadata?.syncStatus;

    // Determine new sync status: if synced or conflict, becomes local-only after edit
    // If server-only, it remains server-only until explicitly saved/synced by user action?
    // Let's assume any local save makes it local-only if it wasn't already.
    const newSyncStatus = (oldSyncStatus === 'synced' || oldSyncStatus === 'conflict') ? 'local-only' : (oldSyncStatus || 'local-only');

    const updatedRule = createRuleFromFileContent({
        id: ruleId,
        filename: path.basename(uri.fsPath),
        content: content,
        lastModified: stats.mtime, // Use actual file modification time
        syncStatus: newSyncStatus
    });

    // Update map and notify UI
    updateRuleInMap(updatedRule);
    console.log(`RuleController: Updated rule ${ruleId} in map after save. New status: ${newSyncStatus}`);

    // Trigger sync using the debounced function if applicable
    if (newSyncStatus === 'local-only' && oldSyncStatus !== 'local-only') {
        if (debouncedSync) {
            console.log(`RuleController: Queuing debounced sync after save for rule ${ruleId}.`);
            debouncedSync(context);
        } else {
            console.error('RuleController: Debounced sync function not initialized!');
            // Fallback to immediate sync? Or just log error?
            // await syncController.syncRules(context); 
        }
    }

  } catch (error: any) {
    console.error(`RuleController: Error processing saved rule file ${uri.fsPath}:`, error);
    // Don't show error message directly here if file was deleted concurrently, etc.
    // Let other handlers manage missing file errors.
  }
}

/**
 * Handles the event when a rule file is deleted from the filesystem.
 * Removes the rule from the internal map and queues server deletion if appropriate.
 */
export async function handleRuleFileDeleted(uri: vscode.Uri, extensionContext?: vscode.ExtensionContext): Promise<void> {
    const ruleId = getRuleIdFromUri(uri);
    const oldRule = rulesMap.get(ruleId);

    if (oldRule) {
        console.log(`RuleController: Handling external deletion for rule file: ${uri.fsPath} (ID: ${ruleId})`);
        removeRuleFromMap(ruleId); // Remove from map and notify UI

        // Handle queueing for server deletion if the rule was previously synced
        if ((oldRule.metadata.syncStatus === 'synced' || oldRule.metadata.syncStatus === 'conflict') && extensionContext) {
            try {
                // Queue for server deletion
                const currentQueue = extensionContext.globalState.get<string[]>(DELETED_RULES_QUEUE_KEY, []);
                if (!currentQueue.includes(ruleId)) {
                    const updatedQueue = [...currentQueue, ruleId];
                    await extensionContext.globalState.update(DELETED_RULES_QUEUE_KEY, updatedQueue);
                    console.log(`RuleController: Rule ${ruleId} queued for server deletion after external file removal.`);
                    
                    // Optionally trigger a sync here, but not doing so reduces overhead for mass deletions
                    // Rely on the next scheduled sync to handle the deletion
                }
            } catch (error) {
                console.error(`RuleController: Failed to queue externally deleted rule ${ruleId} for server deletion:`, error);
            }
        } else if (oldRule.metadata.syncStatus === 'synced' || oldRule.metadata.syncStatus === 'conflict') {
            console.warn(`RuleController: Rule ${ruleId} (synced/conflict) was deleted externally but no extension context available. Server deletion may be delayed.`);
        }
    } else {
        console.log(`RuleController: Received delete event for un-tracked file ${uri.fsPath}`);
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
    try {
        // Generate a unique ID for the rule
        const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Generate a valid filename
        const filename = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphens
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            + RULE_EXTENSION;
        
        // Create the rule
        const rule = createRuleFromFileContent({
            id: ruleId,
            filename,
            content,
            syncStatus: 'local-only'
        });
        
        // Save the rule to local storage
        const saveResult = await localStorageService.saveRule(context, rule);
        if (!saveResult) {
            throw new Error('Failed to save programmatically created rule to local storage')
        }
        
        // Handle the saved file (updates map and notifies UI)
        await handleRuleFileSaved(context, saveResult.uri)

        // Notify
        console.log(`Created rule programmatically: ${title} (${ruleId})`);
        
        // Queue sync if needed - Note: handleRuleFileSaved might already trigger sync
        // Consider if explicit triggering is needed here.
        // If handleRuleFileSaved always triggers, this might be redundant or even cause double sync
        // Let's comment it out for now, as handleRuleFileSaved should manage syncing.
        // syncController.queueSync(); // Requires queueSync to exist
        
        return ruleId;
    } catch (error) {
        console.error('Error creating rule programmatically:', error);
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create rule "${title}" programmatically: ${message}`);
        throw error; // Re-throw to indicate failure to the caller
    }
}
