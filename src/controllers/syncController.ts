import * as vscode from 'vscode'
import * as path from 'path'
import { Rule, RuleMetadata, createRuleFromFileContent } from '../models/rule'
import * as localStorageService from '../services/localStorageService'
import * as ruleController from './ruleController'
import { ServerService } from '../services/serverService'
import { SyncOperations, SyncResult, RuleConflict } from '../models/sync'

// --- Module State ---

const DELETED_RULES_QUEUE_KEY = 'deletedRuleIdsToSync';
const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
const INITIAL_SYNC_DELAY_MS = 5000;
const SERVER_CONNECTION_DEBOUNCE_MS = 2000;
const MAX_BATCH_SIZE = 20; // Define a constant for the new batch size
const SERVER_OPERATION_TIMEOUT_MS = 30000; // 30 seconds timeout for server operations
const MAX_RETRY_ATTEMPTS = 3; // Maximum number of retry attempts for server operations
const RETRY_DELAY_MS = 1000; // Initial delay between retry attempts (will be exponentially increased)

/**
 * Represents the current state of synchronization
 */
export interface SyncStatus {
    /** Whether a sync operation is currently in progress */
    isSyncing: boolean;
    /** Whether a sync request is pending after the current one */
    hasPendingSync: boolean;
    /** The number of rules queued for server deletion */
    pendingDeletions: number;
    /** Whether background sync is currently enabled */
    backgroundSyncEnabled: boolean;
    /** Status of the server connection */
    serverStatus: string;
    /** Time of the last successful sync operation (null if never synced) */
    lastSyncTime: number | null;
}

// State management
let syncIntervalTimer: NodeJS.Timeout | null = null
let isSyncing = false
let pendingSync = false
let deletedRuleIdsToSync = new Set<string>() // In-memory queue, loaded on init
let context: vscode.ExtensionContext | null = null
let serverServiceInstance: ServerService | null = null
let serverConnectionDebounceTimer: NodeJS.Timeout | null = null
let lastSyncTime: number | null = null;

// --- Helper Functions ---

/**
 * Gets the configured sync interval in milliseconds from user settings.
 * 
 * Retrieves the user-configured sync interval from VS Code settings.
 * If not configured, uses the default value. Returns 0 if sync is disabled.
 * 
 * @returns The sync interval in milliseconds, or 0 if sync is disabled
 */
function getSyncIntervalMs(): number {
    try {
        const config = vscode.workspace.getConfiguration('ProjectRules');
        const intervalSeconds = config.get<number>('syncInterval') ?? DEFAULT_SYNC_INTERVAL_SECONDS;
        
        // Enforce minimum of 0 (disabled) and reasonable maximum (1 hour)
        const validatedSeconds = Math.max(0, Math.min(intervalSeconds, 3600));
        
        if (validatedSeconds !== intervalSeconds) {
            console.log(`SyncController: Adjusted sync interval from ${intervalSeconds}s to ${validatedSeconds}s`);
        }
        
        return validatedSeconds > 0 ? validatedSeconds * 1000 : 0;
    } catch (error) {
        // Fall back to default if config reading fails
        console.error('SyncController: Error reading sync interval setting:', 
            error instanceof Error ? error.message : String(error));
        return DEFAULT_SYNC_INTERVAL_SECONDS * 1000;
    }
}

/**
 * Shows a diff view between a local and server rule version.
 * 
 * Creates temporary in-memory files for both rule versions and opens
 * the VS Code diff editor to display their differences side by side.
 * 
 * @param localRule - The local version of the rule
 * @param serverRule - The server version of the rule
 * @returns Promise that resolves when the diff view is shown
 */
async function showConflictDiff(localRule: Rule, serverRule: Rule): Promise<void> {
    if (!localRule || !serverRule) {
        throw new Error('Cannot show diff: Missing rule data');
    }
    
    if (localRule.metadata.id !== serverRule.metadata.id) {
        console.warn(`SyncController: Showing diff between rules with different IDs: ${localRule.metadata.id} vs ${serverRule.metadata.id}`);
    }
    
    try {
        const ext = path.extname(localRule.metadata.filename) || '.mdc';
        const baseName = path.basename(localRule.metadata.filename, ext);
        
        // Ensure unique URIs for diff view if called multiple times by including a timestamp
        const timestamp = Date.now(); 
        const localUri = vscode.Uri.parse(`untitled:${baseName}.local-${timestamp}${ext}?conflict=local&id=${localRule.metadata.id}`);
        const serverUri = vscode.Uri.parse(`untitled:${baseName}.server-${timestamp}${ext}?conflict=server&id=${serverRule.metadata.id}`);
        
        // Write the content to the in-memory documents
        await vscode.workspace.fs.writeFile(localUri, Buffer.from(localRule.content, 'utf8'));
        await vscode.workspace.fs.writeFile(serverUri, Buffer.from(serverRule.content, 'utf8'));
        
        // Open the diff view with a descriptive title
        const diffTitle = `${localRule.metadata.filename}: Local ↔ Server Conflict`;
        await vscode.commands.executeCommand('vscode.diff', localUri, serverUri, diffTitle);
        
        console.log(`SyncController: Displayed diff view for rule "${localRule.metadata.filename}"`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`SyncController: Failed to show diff for rule "${localRule.metadata.filename}":`, error);
        vscode.window.showErrorMessage(`Failed to show diff for rule "${localRule.metadata.filename}": ${message}`);
        
        // Re-throw for the caller to handle
        throw new Error(`Failed to show diff: ${message}`);
    }
}

/**
 * Safely extracts error message from any error type.
 * 
 * Handles various error types (Error objects, strings, or other values)
 * and extracts a user-friendly error message.
 * 
 * @param error - The error object or value to extract message from
 * @returns A string representation of the error
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message || 'Unknown error';
    }
    
    if (typeof error === 'string') {
        return error;
    }
    
    if (error === null) {
        return 'Null error';
    }
    
    if (error === undefined) {
        return 'Undefined error';
    }
    
    try {
        // Handle potential JSON objects or objects with toString methods
        return String(error);
    } catch {
        return 'Unrecognized error';
    }
}

// --- Core Sync Logic ---

/**
 * Performs the main synchronization process.
 * Fetches server rules, compares with local rules, handles uploads, downloads, deletions and conflicts.
 * Reports progress using the provided progress object.
 */
async function performSync(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<{ rulesUpdated: boolean, statusMessages: string[], errorOccurred: boolean }> {
    if (!serverServiceInstance) {
        throw new Error("SyncController: ServerService not initialized.");
    }

    const statusMessages: string[] = []
    let errorOccurred = false
    let rulesUpdated = false

    try {
        // 1. Fetch Server Rules
        progress.report({ message: 'Fetching server rules...', increment: 10 });
        const serverRules = await withRetry(
            () => {
                if (!serverServiceInstance) {
                    throw new Error('Server service not available');
                }
                return withTimeout(
                    serverServiceInstance.fetchRules(),
                    SERVER_OPERATION_TIMEOUT_MS,
                    'Fetch server rules'
                );
            },
            'Fetch server rules'
        );
        const serverRulesMap = new Map(serverRules.map(rule => [rule.metadata.id, rule]))
        console.log(`SyncController: Fetched ${serverRulesMap.size} rules from server.`)

        // 2. Get Local Rules (from controller)
        progress.report({ message: 'Comparing rules...', increment: 10 });
        if (!ruleControllerService.isInitialized || !ruleControllerService.getRules) {
            throw new Error('Rule controller service not properly initialized');
        }
        const localRules = ruleControllerService.getRules();
        const localRulesMap = new Map(localRules.map(rule => [rule.metadata.id, rule]))
        console.log(`SyncController: Comparing with ${localRulesMap.size} local rules.`)

        // 3. Identify Actions
        const rulesToUpload: Rule[] = []
        const rulesToDownload: Rule[] = []
        const conflicts: Array<{ local: Rule, server: Rule }> = []
        const rulesToDeleteLocally: string[] = []

        // Compare Local vs Server
        for (const [id, localRule] of localRulesMap.entries()) {
            const serverRule = serverRulesMap.get(id)
            if (!serverRule) {
                if (localRule.metadata.syncStatus !== 'server-only') {rulesToUpload.push(localRule)}
            } else {
                if (localRule.metadata.lastModified > serverRule.metadata.lastModified) {rulesToUpload.push(localRule)}
                else if (localRule.metadata.lastModified < serverRule.metadata.lastModified) {rulesToDownload.push(serverRule)}
                else if (localRule.content !== serverRule.content && localRule.metadata.syncStatus !== 'conflict') {conflicts.push({ local: localRule, server: serverRule })}
            }
        }
        // Compare Server vs Local
        for (const [id, serverRule] of serverRulesMap.entries()) {
            if (!localRulesMap.has(id)) {rulesToDownload.push(serverRule)}
        }
        for (const [id, localRule] of localRulesMap.entries()) {
             if (!serverRulesMap.has(id) && !rulesToUpload.some(r => r.metadata.id === id))
                 {if (localRule.metadata.syncStatus === 'synced' || localRule.metadata.syncStatus === 'conflict')
                     {rulesToDeleteLocally.push(localRule.metadata.filename)}}
        }

        // Make queues unique before processing
        const uniqueUploadQueue = Array.from(new Map(rulesToUpload.map(r => [r.metadata.id, r])).values());
        let uniqueDownloadQueue = Array.from(new Map(rulesToDownload.map(r => [r.metadata.id, r])).values());
        const uniqueConflicts = Array.from(new Map(conflicts.map(c => [c.local.metadata.id, c])).values());

        console.log(`Sync identified: ${uniqueUploadQueue.length} uploads, ${uniqueDownloadQueue.length} downloads, ${uniqueConflicts.length} conflicts, ${rulesToDeleteLocally.length} local deletes needed.`)

        // 4. Resolve Conflicts (updates upload/download queues)
        if (uniqueConflicts.length > 0) {
            progress.report({ message: `Resolving ${uniqueConflicts.length} conflict(s)...` });
            statusMessages.push(`${uniqueConflicts.length} conflict(s) detected.`);
            const resolvedDownloads: Rule[] = [];
            const resolvedUploads: Rule[] = [];
            for (const conflict of uniqueConflicts) {
                const resolution = await resolveConflict(context, conflict.local, conflict.server)
                if (resolution === 'local') {resolvedUploads.push(conflict.local)}
                if (resolution === 'server') {resolvedDownloads.push(conflict.server)}
                if (resolution !== 'skipped') {rulesUpdated = true}
            }
            // Add resolved items back to respective queues (will be deduplicated later)
            uniqueUploadQueue.push(...resolvedUploads);
            uniqueDownloadQueue.push(...resolvedDownloads);
            // Re-deduplicate queues after conflict resolution might add items back
            uniqueDownloadQueue = Array.from(new Map(uniqueDownloadQueue.map(r => [r.metadata.id, r])).values());
        }

        // 5. Process Local Deletions
        if (rulesToDeleteLocally.length > 0) {
            progress.report({ message: `Deleting ${rulesToDeleteLocally.length} local rule(s)...` });
            let deletedCount = 0
            for (const filename of rulesToDeleteLocally) {
                const ruleUri = await localStorageService.getRuleUri(context, filename);
                if (await localStorageService.deleteRule(context, filename)) {
                    if(ruleUri) {
                        if (!ruleControllerService.isInitialized || !ruleControllerService.handleRuleFileDeleted) {
                            console.warn('SyncController: Rule controller service not initialized for handleRuleFileDeleted');
                        } else {
                            await ruleControllerService.handleRuleFileDeleted(ruleUri, context);
                        }
                    } // Pass context for server deletion handling
                    deletedCount++
                    rulesUpdated = true
                }
            }
            if (deletedCount > 0) {statusMessages.push(`${deletedCount} rule(s) deleted locally.`);}
        }

        // 6. Process Server Deletions
        const idsToDelete = Array.from(deletedRuleIdsToSync);
        if (idsToDelete.length > 0) {
            progress.report({ message: `Deleting ${idsToDelete.length} rules from server...` });
            let deletedCount = 0;
            let failedCount = 0;
            const stillQueued: string[] = [];
            const batchSize = MAX_BATCH_SIZE; // Use constant for consistency
            
            // Process in batches to avoid overwhelming the server
            for (let i = 0; i < idsToDelete.length; i += batchSize) {
                const batch = idsToDelete.slice(i, i + batchSize);
                progress.report({ 
                    message: `Deleting rules from server (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(idsToDelete.length/batchSize)})...` 
                });
                
                try {
                    // Call server API to delete the batch
                    const results = await withRetry(
                        () => {
                            if (!serverServiceInstance) {
                                throw new Error('Server service not available');
                            }
                            return withTimeout(
                                serverServiceInstance.deleteRules(batch),
                                SERVER_OPERATION_TIMEOUT_MS,
                                'Server rule deletion'
                            );
                        },
                        'Server rule deletion'
                    );
                    
                    // Keep track of successful deletions
                    deletedCount += results.length;
                    
                    // Check if any IDs failed to delete and keep them in the queue
                    const successSet = new Set(results);
                    const failedInBatch = batch.filter(id => !successSet.has(id));
                    
                    if (failedInBatch.length > 0) {
                        console.log(`SyncController: ${failedInBatch.length} rule(s) in batch not deleted successfully`);
                        stillQueued.push(...failedInBatch);
                        failedCount += failedInBatch.length;
                    }
                } catch (delErr) {
                    // Handle batch-level errors (network issues, server errors, etc.)
                    console.error(`SyncController: Failed to delete server rule batch (start index ${i}):`, delErr);
                    
                    // Keep all IDs in the failed batch for retry in next sync
                    stillQueued.push(...batch);
                    failedCount += batch.length;
                    errorOccurred = true;
                    
                    // Add user-friendly error message
                    const message = getErrorMessage(delErr);
                    statusMessages.push(`Server deletion failed: ${message}`);
                    
                    // Add a brief delay before retrying next batch to avoid overwhelming server
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Update both persistent storage and in-memory queue
            if (stillQueued.length !== deletedRuleIdsToSync.size) {
                // Only update if there was a change
                await context.globalState.update(DELETED_RULES_QUEUE_KEY, stillQueued);
                deletedRuleIdsToSync = new Set(stillQueued);
                console.log(`SyncController: Updated deletion queue to ${stillQueued.length} pending items`);
            }

            // Report results to user
            if (deletedCount > 0) {
                statusMessages.push(`${deletedCount} rule(s) deleted from server.`);
                rulesUpdated = true;
            }
             
            if (failedCount > 0) {
                statusMessages.push(`${failedCount} rule deletion(s) failed, will retry on next sync.`);
            }
        }

        // 7. Process Uploads
        if (uniqueUploadQueue.length > 0) {
            progress.report({ message: `Uploading ${uniqueUploadQueue.length} rule(s)...` });
            let uploadedCount = 0;
            let uploadFailedCount = 0;
            const batchSize = 10; // Adjust batch size as needed
            const totalBatches = Math.ceil(uniqueUploadQueue.length / batchSize);

            for (let i = 0; i < uniqueUploadQueue.length; i += batchSize) {
                const batch = uniqueUploadQueue.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;
                
                progress.report({ 
                    message: `Uploading batch ${batchNumber}/${totalBatches} (${batch.length} rules)...` 
                });
                
                try {
                    const uploadedRules = await withRetry(
                        () => {
                            if (!serverServiceInstance) {
                                throw new Error('Server service not available');
                            }
                            return withTimeout(
                                serverServiceInstance.uploadRules(batch),
                                SERVER_OPERATION_TIMEOUT_MS,
                                'Server rule upload'
                            );
                        },
                        'Server rule upload'
                    );
                    
                    // Update progress
                    progress.report({ 
                        message: `Applying server updates for batch ${batchNumber}/${totalBatches}...` 
                    });
                    
                    // Update local state for successfully uploaded rules
                    for (const rule of uploadedRules) {
                         const ruleWithSyncedStatus: Rule = { 
                            ...rule, 
                            metadata: { ...rule.metadata, syncStatus: 'synced' } 
                         };
                        await localStorageService.saveRule(context, ruleWithSyncedStatus);
                        // Update rule in controller without triggering another sync
                        if (!ruleControllerService.isInitialized || !ruleControllerService.updateRuleInMap) {
                            console.warn('SyncController: Rule controller service not initialized for updateRuleInMap');
                        } else {
                            ruleControllerService.updateRuleInMap(ruleWithSyncedStatus);
                        }
                        uploadedCount++;
                    }
                } catch (uploadError) {
                    console.error(`SyncController: Failed to upload rule batch ${batchNumber}/${totalBatches}:`, uploadError);
                    uploadFailedCount += batch.length;
                    errorOccurred = true;
                    const message = getErrorMessage(uploadError);
                    statusMessages.push(`Upload failed: ${message}`);
                    // Log individual rule names that failed
                    batch.forEach(rule => {
                        console.warn(`SyncController: Failed to upload rule: ${rule.metadata.filename}`);
                    });
                }
            }

            if (uploadedCount > 0) {
                statusMessages.push(`${uploadedCount} rule(s) uploaded.`);
                rulesUpdated = true;
            }
            if (uploadFailedCount > 0) {
                statusMessages.push(`${uploadFailedCount} rule upload(s) failed.`);
            }
        }

        // 8. Process Downloads
        if (uniqueDownloadQueue.length > 0) {
            progress.report({ message: `Downloading ${uniqueDownloadQueue.length} rule(s)...` });
            let downloadedCount = 0
            let failedCount = 0;
            
            // Process each download with progress updates
            for (let i = 0; i < uniqueDownloadQueue.length; i++) {
                const serverRule = uniqueDownloadQueue[i];
                const progressPercent = Math.floor((i / uniqueDownloadQueue.length) * 100);
                progress.report({ 
                    message: `Downloading rule ${i+1}/${uniqueDownloadQueue.length}: ${serverRule.metadata.filename}` 
                });
                
                try {
                    // Use the dedicated method to update the rule from server
                    if (!ruleControllerService.isInitialized || !ruleControllerService.updateRuleFromServer) {
                        throw new Error('Rule controller service not properly initialized for updateRuleFromServer');
                    }
                    
                    await ruleControllerService.updateRuleFromServer(context, serverRule);
                    downloadedCount++;
                    rulesUpdated = true;
                } catch (error) {
                    console.error(`SyncController: Failed to save downloaded rule ${serverRule.metadata.filename}:`, error);
                    const message = getErrorMessage(error);
                    vscode.window.showWarningMessage(`Failed to save downloaded rule ${serverRule.metadata.filename}: ${message}.`);
                    errorOccurred = true;
                    statusMessages.push(`Download save failed: ${message}`);
                    failedCount++;
                }
            }
            
            if (downloadedCount > 0) {
                statusMessages.push(`${downloadedCount} rule(s) downloaded.`);
            }
            
            if (failedCount > 0) {
                statusMessages.push(`${failedCount} rule download(s) failed.`);
            }
        }

        if (!rulesUpdated && statusMessages.length === 0 && !errorOccurred) {
            statusMessages.push('Rules are up to date.');
        }

        lastSyncTime = Date.now();

    } catch (error) {
        console.error('SyncController: Error during sync process:', error)
        const message = getErrorMessage(error)
        vscode.window.showErrorMessage(`Sync failed: ${message}`);
        errorOccurred = true;
        statusMessages.push(`Sync aborted due to error: ${message}`);
    }

    return { rulesUpdated, statusMessages, errorOccurred };
}

/**
 * Handles conflict resolution between a local and server rule.
 * 
 * Presents the user with options to resolve a synchronization conflict:
 * - Keep Local: Use the local version and upload it to the server
 * - Keep Server: Replace local with the server version
 * - Compare: Show a diff view of both versions and re-prompt
 * - Keep Both (Renamed): Create a renamed copy of the local version and use the server version
 * - Mark as Conflict: Keep the local version but mark it as conflicted for later resolution
 * 
 * @param context - The extension context for local storage operations
 * @param localRule - The local version of the rule
 * @param serverRule - The server version of the rule
 * @returns Promise resolving to 'local', 'server', or 'skipped' indicating resolution choice
 */
async function resolveConflict(context: vscode.ExtensionContext, localRule: Rule, serverRule: Rule): Promise<'local' | 'server' | 'skipped'> {
    if (!context || !localRule || !serverRule) {
        console.error('SyncController: Invalid parameters for conflict resolution');
        throw new Error('Invalid parameters for conflict resolution');
    }
    
    try {
        // Format dates for better user readability
        const localDate = new Date(localRule.metadata.lastModified).toLocaleString();
        const serverDate = new Date(serverRule.metadata.lastModified).toLocaleString();
        
        // Construct a detailed message with rule information
        const message = `Conflict detected for rule "${localRule.metadata.filename}"
        • Local version last modified: ${localDate}
        • Server version last modified: ${serverDate}

Which version do you want to keep?`;

        // Ask user for resolution choice
        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Keep Local', 
            'Keep Server', 
            'Compare', 
            'Keep Both (Renamed)', 
            'Mark as Conflict'
        );
        
        // Handle simple cases directly
        if (choice === 'Keep Local') {
            console.log(`SyncController: User chose to keep local version of rule ${localRule.metadata.id}`);
            return 'local';
        }
        
        if (choice === 'Keep Server') {
            console.log(`SyncController: User chose to keep server version of rule ${serverRule.metadata.id}`);
            return 'server';
        }
        
        // Show diff view and re-prompt
        if (choice === 'Compare') {
            console.log(`SyncController: Showing diff view for rule ${localRule.metadata.id}`);
            
            try {
                await showConflictDiff(localRule, serverRule);
                // Re-ask after showing diff
                return resolveConflict(context, localRule, serverRule);
            } catch (diffError) {
                console.error('SyncController: Error showing conflict diff:', diffError);
                vscode.window.showErrorMessage(`Could not show diff: ${diffError instanceof Error ? diffError.message : String(diffError)}`);
                // Re-ask without showing diff
                return resolveConflict(context, localRule, serverRule);
            }
        } 
        
        // Create a renamed local copy
        if (choice === 'Keep Both (Renamed)') {
            console.log(`SyncController: Creating renamed copy of rule ${localRule.metadata.id}`);
            
            let localCopyCreated = false;
            let newFilename = '';
            
            try {
                // Generate new filename
                const ext = path.extname(localRule.metadata.filename);
                const baseName = path.basename(localRule.metadata.filename, ext);
                newFilename = `${baseName}-local-copy${ext}`;
                
                // Create a copy with a new ID and filename
                const localCopy = createRuleFromFileContent({
                    id: `${localRule.metadata.id}-local-copy`,
                    filename: newFilename,
                    content: localRule.content,
                    lastModified: localRule.metadata.lastModified,
                    syncStatus: 'local-only' // Set as local-only to trigger upload on next sync
                });
                
                // Save the local copy
                const saveResult = await localStorageService.saveRule(context, localCopy);
                if (saveResult) {
                    try {
                        if (!ruleControllerService.isInitialized || !ruleControllerService.handleRuleFileSaved) {
                            throw new Error('Rule controller service not properly initialized');
                        }
                        await ruleControllerService.handleRuleFileSaved(context, saveResult.uri);
                        console.log(`SyncController: Created local copy as ${newFilename}`);
                        vscode.window.showInformationMessage(`Created local copy as "${newFilename}" and keeping server version.`);
                        localCopyCreated = true;
                    } catch (notifyError) {
                        // Even if notification fails, the file was still created
                        console.warn(`SyncController: File created but failed to notify controller: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
                        vscode.window.showInformationMessage(`Created local copy as "${newFilename}" but encountered a notification error.`);
                        localCopyCreated = true;
                    }
                } else {
                    console.error(`SyncController: Failed to create local copy of rule ${localRule.metadata.filename}`);
                    vscode.window.showErrorMessage(`Failed to create local copy. Using server version only.`);
                }
                
                // First delete the original local rule to avoid conflicts
                if (localCopyCreated && ruleControllerService.isInitialized && ruleControllerService.deleteRule) {
                    try {
                        const deleteResult = await ruleControllerService.deleteRule(context, localRule.metadata.id);
                        if (deleteResult) {
                            console.log(`SyncController: Successfully deleted original local rule ${localRule.metadata.id} to be replaced by server version`);
                        } else {
                            console.warn(`SyncController: Failed to delete original local rule ${localRule.metadata.id}`);
                            vscode.window.showWarningMessage(`Note: The original rule could not be properly deleted. This might cause issues with the server version.`);
                        }
                    } catch (deleteError) {
                        console.error(`SyncController: Error deleting original rule:`, deleteError);
                        vscode.window.showWarningMessage(`Error removing original rule: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
                    }
                }
                
                // Return server for the original file path
                // We continue with server version even if local copy failed,
                // to avoid being stuck in a conflict state
                return 'server';
            } catch (copyError) {
                console.error(`SyncController: Error creating local copy:`, copyError);
                const errorMessage = copyError instanceof Error ? copyError.message : String(copyError);
                
                if (localCopyCreated) {
                    // Despite the error, if the file was created, we can proceed
                    vscode.window.showWarningMessage(`Created local copy "${newFilename}" with some errors: ${errorMessage}. Still using server version for original.`);
                    return 'server';
                }
                
                // Only show error and re-prompt if local copy completely failed
                vscode.window.showErrorMessage(`Failed to create local copy: ${errorMessage}`);
                
                // Ask if user wants to try again or just use server version
                const retryChoice = await vscode.window.showWarningMessage(
                    `What would you like to do?`,
                    { modal: true },
                    'Try Again', 
                    'Keep Server Only',
                    'Mark as Conflict'
                );
                
                if (retryChoice === 'Try Again') {
                    // Re-try the conflict resolution
                    return resolveConflict(context, localRule, serverRule);
                } else if (retryChoice === 'Keep Server Only') {
                    // User decided to just use server version
                    return 'server';
                } else {
                    // Default to marking as conflict if user cancels or chooses "Mark as Conflict"
                    try {
                        const conflictedRule = createRuleFromFileContent({ 
                            id: localRule.metadata.id,
                            filename: localRule.metadata.filename,
                            content: localRule.content, // Keep local content
                            lastModified: localRule.metadata.lastModified, 
                            syncStatus: 'conflict'
                        });
                        
                        const saveResult = await localStorageService.saveRule(context, conflictedRule);
                        if (saveResult) {
                            if (!ruleControllerService.isInitialized || !ruleControllerService.handleRuleFileSaved) {
                                console.warn('SyncController: Rule controller service not initialized for handleRuleFileSaved');
                            } else {
                                await ruleControllerService.handleRuleFileSaved(context, saveResult.uri);
                                console.log(`SyncController: Marked ${localRule.metadata.filename} as conflicted after failed copy`);
                                vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict. You can resolve it later.`);
                            }
                        }
                    } catch (conflictError) {
                        console.error(`SyncController: Could not mark as conflict after copy failure:`, conflictError);
                    }
                    return 'skipped';
                }
            }
        }
        
        // Mark explicitly as conflict
        if (choice === 'Mark as Conflict') {
            console.log(`SyncController: Marking rule ${localRule.metadata.id} as conflicted`);
            
            try {
                // Explicitly mark as conflict and keep local content
                const conflictedRule = createRuleFromFileContent({ 
                    id: localRule.metadata.id,
                    filename: localRule.metadata.filename,
                    content: localRule.content, // Keep local content
                    lastModified: localRule.metadata.lastModified, 
                    syncStatus: 'conflict' // Set status
                });
                
                // Save the conflicted state
                const saveResult = await localStorageService.saveRule(context, conflictedRule);
                if (saveResult) {
                    if (!ruleControllerService.isInitialized || !ruleControllerService.handleRuleFileSaved) {
                        console.warn('SyncController: Rule controller service not initialized for handleRuleFileSaved');
                        vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict, but notification failed.`);
                    } else {
                        await ruleControllerService.handleRuleFileSaved(context, saveResult.uri);
                        console.log(`SyncController: Marked ${localRule.metadata.filename} as conflicted locally.`);
                        vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict for later resolution.`);
                    }
                } else {
                    console.error(`SyncController: Failed to save conflicted state for rule ${localRule.metadata.filename}`);
                    vscode.window.showErrorMessage(`Failed to mark as conflict: Could not save rule state`);
                }
                return 'skipped';
            } catch (markError) {
                console.error(`SyncController: Error marking as conflict:`, markError);
                vscode.window.showErrorMessage(`Failed to mark as conflict: ${markError instanceof Error ? markError.message : String(markError)}`);
                
                // Default to skipped if marking as conflict fails
                return 'skipped';
            }
        }
        
        // Default case (user dismissed dialog) - Mark as conflict
        console.log(`SyncController: Conflict resolution dialog dismissed for ${localRule.metadata.filename}. Marking as conflict.`);
        
        try {
            const conflictedRule = createRuleFromFileContent({ 
                id: localRule.metadata.id,
                filename: localRule.metadata.filename,
                content: localRule.content, // Keep local content
                lastModified: localRule.metadata.lastModified, 
                syncStatus: 'conflict' // Set status
            });
            
            const saveResult = await localStorageService.saveRule(context, conflictedRule);
            if (saveResult) {
                if (!ruleControllerService.isInitialized || !ruleControllerService.handleRuleFileSaved) {
                    console.warn('SyncController: Rule controller service not initialized for handleRuleFileSaved');
                    vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict, but notification failed.`);
                } else {
                    await ruleControllerService.handleRuleFileSaved(context, saveResult.uri);
                    console.log(`SyncController: Marked ${localRule.metadata.filename} as conflicted locally.`);
                    vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict for later resolution.`);
                }
            } else {
                console.error(`SyncController: Failed to save conflicted state for rule ${localRule.metadata.filename}`);
                vscode.window.showErrorMessage(`Could not save conflict state for "${localRule.metadata.filename}".`);
            }
        } catch (defaultError) {
            console.error(`SyncController: Error in default conflict handling:`, defaultError);
        }
        
        return 'skipped';
    } catch (error) {
        // Handle any unexpected errors in the conflict resolution process
        console.error(`SyncController: Unexpected error during conflict resolution:`, error);
        vscode.window.showErrorMessage(`Error during conflict resolution: ${error instanceof Error ? error.message : String(error)}`);
        return 'skipped'; // Default to skipped on errors
    }
}

// --- Exported Controller Functions ---

/**
 * Initializes the sync controller state and sets up event listeners.
 * 
 * This function is called once during extension activation and:
 * 1. Stores the extension context for later use
 * 2. Sets up the reference to the server service
 * 3. Loads previously queued rule deletions from global state
 * 4. Registers event listeners for server connection changes
 * 5. Sets up automatic cleanup when the extension is deactivated
 * 
 * @param ctx - The extension context for accessing global state and subscriptions
 * @param serverService - The server service instance for API calls
 * @throws Error if critical initialization fails
 */
export function initializeSyncController(ctx: vscode.ExtensionContext, serverService: ServerService): void {
    if (!ctx) {
        throw new Error('SyncController initialization failed: Extension context is required');
    }
    
    if (!serverService) {
        throw new Error('SyncController initialization failed: ServerService is required');
    }

    try {
        console.log('SyncController: Initializing...');
        
        // Store references for later use
        context = ctx;
        serverServiceInstance = serverService;
        
        // Load deletion queue from persistent storage
        const deletedIds = ctx.globalState.get<string[]>(DELETED_RULES_QUEUE_KEY, []);
        deletedRuleIdsToSync = new Set(deletedIds);
        
        console.log(`SyncController: Loaded ${deletedRuleIdsToSync.size} rule IDs queued for server deletion.`);
        
        // Register for extension deactivation
        ctx.subscriptions.push({ 
            dispose: () => {
                console.log('SyncController: Disposing resources...');
                stopBackgroundSync();
                // Reset module state to prevent stale references
                context = null;
                serverServiceInstance = null;
                deletedRuleIdsToSync.clear();
            }
        });
        
        // Listen to server connection status changes with debounce
        serverServiceInstance.onStatusChanged((status) => {
            console.log(`SyncController: Server status changed to ${status}`);
            
            // Clear any existing debounce timer
            if (serverConnectionDebounceTimer) {
                clearTimeout(serverConnectionDebounceTimer);
                serverConnectionDebounceTimer = null;
            }
            
            // Set a new debounce timer for connection events
            if (status === 'connected') {
                serverConnectionDebounceTimer = setTimeout(() => {
                    console.log('SyncController: Server connected, triggering background sync.')
                    
                    // Check if context is still valid before triggering sync
                    if (context) {
                        syncRules(context, true).catch(error => {
                            console.error('SyncController: Error in connection-triggered sync:', 
                                error instanceof Error ? error.message : String(error));
                        });
                    } else {
                        console.warn('SyncController: Skipping connection-triggered sync, context lost');
                    }
                    
                    serverConnectionDebounceTimer = null;
                }, SERVER_CONNECTION_DEBOUNCE_MS);
            }
        });
        
        console.log('SyncController: Successfully initialized');
    } catch (error) {
        // Critical initialization error
        const message = error instanceof Error ? error.message : String(error);
        console.error(`SyncController: Initialization failed: ${message}`, error);
        
        // Reset any partial state
        context = null;
        serverServiceInstance = null;
        deletedRuleIdsToSync.clear();
        
        // Rethrow to notify caller of the failure
        throw new Error(`Failed to initialize SyncController: ${message}`);
    }
}

/**
 * Starts the background synchronization timer based on configuration.
 * 
 * This function sets up periodic synchronization based on user configuration.
 * It handles:
 * - Retrieving the configured sync interval from user settings
 * - Setting up appropriate timers for full and incremental syncs
 * - Scheduling an initial sync after a short delay
 * - Registering the timers for proper cleanup on extension deactivation
 * 
 * @param ctx - The extension context for subscription management
 * @throws Will not throw, but logs errors if encountered
 */
export function startBackgroundSync(ctx: vscode.ExtensionContext): void {
    if (!serverServiceInstance) {
        console.warn('SyncController: Cannot start background sync, ServerService not initialized.');
        return;
    }
    
    // Clean up any existing timer first to avoid duplicates
    stopBackgroundSync();

    // Get the configured sync interval in milliseconds
    const intervalMs = getSyncIntervalMs();
    const intervalSeconds = intervalMs / 1000;

    // Handle disabled case
    if (intervalSeconds <= 0) {
        console.log('SyncController: Background sync is disabled in settings (interval set to 0).');
        return;
    }
    
    console.log(`SyncController: Starting background sync every ${intervalSeconds} seconds.`);
    
    try {
        // Set up the main sync timer
        syncIntervalTimer = setInterval(async () => {
            console.log('SyncController: Triggering scheduled background sync...');
            
            // Ensure context is still valid
            if (!context) {
                console.warn('SyncController: Background sync skipped, context lost.');
                stopBackgroundSync(); // Stop if context is lost
                return;
            }
            
            // Check server connection before attempting sync
            if (serverServiceInstance?.getConnectionStatus() !== 'connected') {
                console.log('SyncController: Skipping scheduled sync, server not connected');
                return;
            }
           
            try {
                await syncRules(context, true);
            } catch (syncError) {
                console.error('SyncController: Error in background sync:', 
                    syncError instanceof Error ? syncError.message : String(syncError));
                // Don't stop the timer on individual sync failures
            }
        }, intervalMs);

        // For longer intervals, add intermediate server checks to keep local rules updated
        // without waiting for the full sync cycle
        if (intervalSeconds >= 60) {
            // Calculate a reasonable fetch interval (minimum 30 seconds, maximum half the full sync interval)
            const fetchIntervalMs = Math.max(30000, Math.min(intervalMs / 2, 300000));
            console.log(`SyncController: Setting up incremental server checks every ${fetchIntervalMs/1000} seconds.`);
            
            const fetchIntervalTimer = setInterval(async () => {
                // Only run if not already syncing and server is connected
                if (!isSyncing && context && serverServiceInstance?.getConnectionStatus() === 'connected') { 
                    console.log('SyncController: Running incremental server check...');
                    try {
                        const changesApplied = await fetchAndApplyServerChanges(context);
                        
                        if (changesApplied > 0) {
                            console.log(`SyncController: Incremental check applied ${changesApplied} changes`);
                        }
                    } catch (error) {
                        console.error("SyncController: Error in incremental server check:", 
                            error instanceof Error ? error.message : String(error));
                        // Don't stop the timer on individual fetch failures
                    }
                }
            }, fetchIntervalMs);
            
            // Register for cleanup
            ctx.subscriptions.push({ dispose: () => {
                clearInterval(fetchIntervalTimer);
                console.log('SyncController: Stopped incremental server check timer');
            }});
        }

        // Schedule initial sync with a delay to avoid overloading on startup
        const initialSyncTimer = setTimeout(() => {
            if (context && serverServiceInstance?.getConnectionStatus() === 'connected') {
                console.log('SyncController: Performing initial background sync after startup.');
                syncRules(context, true).catch(err => {
                    console.error('SyncController: Error in initial background sync:', 
                        err instanceof Error ? err.message : String(err));
                });
            } else {
                console.log('SyncController: Skipping initial background sync, server not connected');
            }
        }, INITIAL_SYNC_DELAY_MS);
        
        // Register the initial sync timer for cleanup
        ctx.subscriptions.push({ dispose: () => clearTimeout(initialSyncTimer) });
        
        console.log('SyncController: Background sync successfully initialized');
    } catch (error) {
        // This should rarely happen, but handle unexpected errors in timer setup
        console.error('SyncController: Failed to start background sync:', 
            error instanceof Error ? error.message : String(error));
        
        // Clean up any partially initialized timers
        stopBackgroundSync();
    }
}

/**
 * Stops the background synchronization timer.
 * 
 * Safely cleans up all background sync timers to prevent memory leaks
 * and unnecessary operations when the extension is being deactivated
 * or when sync settings change.
 * 
 * @returns void
 */
export function stopBackgroundSync(): void {
    if (syncIntervalTimer) {
        console.log('SyncController: Stopping background sync timer.');
        clearInterval(syncIntervalTimer);
        syncIntervalTimer = null;
    } else {
        console.log('SyncController: No active background sync timer to stop.');
    }
}

/**
 * Manually triggers a full synchronization cycle.
 * 
 * This function coordinates the synchronization process between local rules and the server,
 * handling proper locking, queueing of repeated requests, progress reporting, and error handling.
 * 
 * The synchronization process includes:
 * - Fetching rules from the server
 * - Comparing with local rules
 * - Handling uploads, downloads, conflicts and deletions
 * - Updating the UI based on results
 * 
 * @param context - The extension context for accessing global state
 * @param background - Whether this sync is triggered automatically (true) or manually by user (false)
 * @returns Promise that resolves when sync is complete or queued if already in progress
 * @throws Error only for catastrophic failures outside the main sync logic
 */
export async function syncRules(context: vscode.ExtensionContext, background: boolean = false): Promise<void> {
    // Validate required dependencies
    if (!serverServiceInstance) {
        const message = "MCP Server URL not configured or service not ready";
        console.warn(`SyncController: ${message}`);
        vscode.window.showWarningMessage(message);
        return;
    }

    // Check server connection status
    const connectionStatus = serverServiceInstance.getConnectionStatus();
    if (connectionStatus !== 'connected') {
        const message = `Cannot sync: Server is currently ${connectionStatus}`;
        console.warn(`SyncController: ${message}`);
        
        if (!background) {
            // Only show UI message for manual syncs
            vscode.window.showWarningMessage(message);
        }
        return;
    }

    // Handle already syncing case with proper queueing
    if (isSyncing) {
        console.log(`SyncController: Sync already in progress, ${background ? 'queueing background' : 'queueing manual'} sync request`);
        
        if (!background) {
            vscode.window.showInformationMessage('Sync already in progress. Your request will be processed next.');
        }
        
        pendingSync = true; // Request another sync after the current one finishes
        return;
    }

    // Acquire lock and prepare for sync
    isSyncing = true;
    pendingSync = false; // Reset pending flag
    const startTime = Date.now();

    console.log(`SyncController: Starting ${background ? 'background' : 'manual'} sync operation...`);
    
    // Update status bar for better user feedback
    const statusMessage = '$(sync~spin) Syncing rules...';
    const statusBarItem = vscode.window.setStatusBarMessage(statusMessage, 10000);

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: background ? 'Background Sync in Progress' : 'Syncing Cursor Rules',
                cancellable: false
            },
            async (progress) => {
                try {
                    // Perform the actual sync operation
                    const { rulesUpdated, statusMessages, errorOccurred } = await performSync(context, progress);
                    const duration = Date.now() - startTime;
                    console.log(`SyncController: Sync finished in ${duration}ms. Status: ${statusMessages.join(' | ')}`);

                    // Show notification based on context and results
                    if (!background || errorOccurred || rulesUpdated) {
                        const durationText = (duration / 1000).toFixed(1);
                        const message = statusMessages.length > 0 
                            ? `Sync complete (${durationText}s): ${statusMessages.join('. ')}`
                            : `Sync complete (${durationText}s): No changes required`;
                            
                        vscode.window.showInformationMessage(message);
                    }

                    // Refresh UI if needed
                    if (rulesUpdated) {
                        vscode.commands.executeCommand('projectRules.refreshRulesView');
                    }
                } catch (innerError) {
                    // Handle errors within the progress window
                    const message = innerError instanceof Error ? innerError.message : String(innerError);
                    console.error('SyncController: Error during sync execution:', innerError);
                    vscode.window.showErrorMessage(`Sync operation failed: ${message}`);
                    
                    // Ensure these errors are logged but don't propagate further
                    // This avoids breaking the outer progress window
                }
            }
        );
    } catch (error) {
        // Only catastrophic errors should reach here (the progress API itself failed)
        console.error('SyncController: Critical error during sync initiation:', error);
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Sync process could not start: ${message}`);
    } finally {
        // Clean up regardless of success or failure
        statusBarItem.dispose(); // Clear status bar message
        
        // Release lock and handle pending requests
        const wasSyncing = isSyncing; // Store for logging
        isSyncing = false;
        
        if (pendingSync) {
            console.log('SyncController: Processing pending sync request');
            pendingSync = false; // Reset before starting the new one
            
            // Short delay before starting next sync to avoid overwhelming system
            setTimeout(() => {
                syncRules(context, background).catch(err => {
                    console.error('SyncController: Error in pending sync execution:', 
                        err instanceof Error ? err.message : String(err));
                });
            }, 1000);
        } else {
            console.log('SyncController: Sync completed, no pending requests');
        }
    }
}

/**
 * Queues a rule ID for deletion from the server on next sync.
 * 
 * This function is part of the rule deletion flow. When a rule is deleted locally,
 * this function adds it to a tracking queue that ensures it will be removed from 
 * the server during the next synchronization process. The queue persists between 
 * extension sessions in the extension's global state.
 * 
 * The function:
 * 1. Adds the rule ID to the in-memory tracking set
 * 2. Persists the updated queue to extension storage
 * 3. Logs the operation for debugging purposes
 * 
 * @param context - The extension context for accessing global state storage
 * @param ruleId - The ID of the rule to queue for server deletion
 * @returns Promise that resolves when the deletion has been successfully queued
 * @throws Error if the global state update fails
 */
export async function queueRuleForServerDeletion(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
    if (!ruleId || typeof ruleId !== 'string') {
        console.error('SyncController: Invalid rule ID provided for server deletion queue');
        throw new Error('Invalid rule ID for deletion queue');
    }
    
    try {
        // Add to the in-memory tracking set first
        const alreadyQueued = deletedRuleIdsToSync.has(ruleId);
        deletedRuleIdsToSync.add(ruleId);
        
        if (alreadyQueued) {
            console.log(`SyncController: Rule ${ruleId} was already in server deletion queue`);
            return; // Already queued, no need to update storage
        }
        
        // Convert to array for storage
        const queueArray = Array.from(deletedRuleIdsToSync);
        
        // Persist to extension storage
        await context.globalState.update(DELETED_RULES_QUEUE_KEY, queueArray);
        
        console.log(`SyncController: Queued rule ${ruleId} for server deletion (queue size: ${queueArray.length})`);
    } catch (error) {
        // Log the error and re-throw
        const message = error instanceof Error ? error.message : String(error);
        console.error(`SyncController: Failed to queue rule ${ruleId} for server deletion: ${message}`, error);
        
        // Remove from in-memory set if storage update failed
        deletedRuleIdsToSync.delete(ruleId);
        
        throw new Error(`Failed to queue rule for server deletion: ${message}`);
    }
}

/**
 * Fetches all rules from the server and applies any changes not related to current sync operations.
 * 
 * This lightweight sync operation focuses only on downloading new or updated rules from the server,
 * without uploading local changes or handling conflicts. It's designed to run periodically in
 * the background to keep the local rule set up-to-date with server-side changes made elsewhere.
 * 
 * Key features:
 * - Skips operation if a full sync is already in progress
 * - Only downloads and applies server rules that are newer than local copies
 * - Avoids touching rules marked as conflicted
 * - Returns the number of local rules updated for reporting
 * 
 * @param context - The extension context providing access to global state
 * @returns Promise resolving to the number of rules that were updated locally
 */
export async function fetchAndApplyServerChanges(context: vscode.ExtensionContext): Promise<number> {
    // Early exit conditions with improved logging
    if (!serverServiceInstance) {
        console.log('SyncController: Skipping fetch server changes, server service not initialized');
        return 0;
    }
    
    const connectionStatus = serverServiceInstance.getConnectionStatus();
    if (connectionStatus !== 'connected') {
        console.log(`SyncController: Skipping fetch server changes, server status is ${connectionStatus}`);
        return 0;
    }
    
    if (isSyncing) {
        console.log('SyncController: Skipping fetch server changes, full sync is already in progress');
        return 0;
    }

    // Acquire lock and prepare
    let changesApplied = 0;
    isSyncing = true;
    let syncStarted = false;
    
    try {
        syncStarted = true;
        console.log('SyncController: Starting incremental server fetch...');
        
        // Fetch server rules with proper error handling
        let serverRules: Rule[];
        try {
            serverRules = await serverServiceInstance.fetchRules();
            console.log(`SyncController: Fetched ${serverRules.length} rules from server`);
        } catch (fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            console.error(`SyncController: Failed to fetch rules from server: ${message}`, fetchError);
            throw fetchError; // Re-throw to be handled by outer catch
        }
        
        // Get local rules for comparison
        if (!ruleControllerService.isInitialized || !ruleControllerService.getRules) {
            console.warn('SyncController: Rule controller service not initialized for getRules');
            throw new Error('Rule controller service not properly initialized');
        }
        const localRules = ruleControllerService.getRules();
        const localRulesMap = new Map(localRules.map(r => [r.metadata.id, r]));
        console.log(`SyncController: Comparing with ${localRulesMap.size} local rules`);
        
        // Process each server rule
        for (const serverRule of serverRules) {
            const localRule = localRulesMap.get(serverRule.metadata.id);
            
            // Check if this rule needs to be applied locally
            const needsUpdate = !localRule || 
                (serverRule.metadata.lastModified > localRule.metadata.lastModified && 
                 localRule.metadata.syncStatus !== 'conflict');
                
            if (needsUpdate) {
                try {
                    // Apply the update through the rule controller
                    if (!ruleControllerService.isInitialized || !ruleControllerService.updateRuleFromServer) {
                        throw new Error('Rule controller service not properly initialized');
                    }
                    
                    // Use the dedicated method to update the rule from server
                    await ruleControllerService.updateRuleFromServer(context, serverRule);
                    changesApplied++;
                } catch (updateError) {
                    console.error(`SyncController: Failed to update rule ${serverRule.metadata.id} locally:`, updateError);
                    // Continue with other rules instead of failing the entire operation
                }
            }
        }
        
        // Report results with more detailed logging
        if (changesApplied > 0) {
            console.log(`SyncController: Applied ${changesApplied} changes from server (${serverRules.length} total rules checked)`);
            vscode.window.showInformationMessage(`Updated ${changesApplied} rule(s) from server`);
            vscode.commands.executeCommand('projectRules.refreshRulesView');
        } else {
            console.log(`SyncController: No changes needed from server (${serverRules.length} rules checked)`);
        }
        
        return changesApplied;
    } catch (error) {
        // Handle errors only if we got past the early exit conditions
        if (syncStarted) {
            console.error('SyncController: Error fetching and applying server changes:', error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to check for server updates: ${message}`);
        }
        return 0;
    } finally {
        // Always release the lock
        isSyncing = false;
        console.log(`SyncController: Completed incremental server fetch with ${changesApplied} changes applied`);
    }
}

/**
 * Returns the current synchronization status details
 * 
 * This function provides a comprehensive overview of the current sync state,
 * including information about in-progress operations, pending operations,
 * queued deletions, and server connection status.
 * 
 * This is useful for UI components that need to display sync status information
 * or for diagnostic purposes.
 * 
 * @returns An object containing detailed sync status information
 */
export function getSyncStatus(): SyncStatus {
    return {
        isSyncing,
        hasPendingSync: pendingSync,
        pendingDeletions: deletedRuleIdsToSync.size,
        backgroundSyncEnabled: syncIntervalTimer !== null,
        serverStatus: serverServiceInstance?.getConnectionStatus() || 'disconnected',
        lastSyncTime
    };
}

// Export additional utility functions for testing if needed
export const __testing = {
    getErrorMessage,
    performSync
};

/**
 * Wraps a promise with a timeout to prevent operations from hanging indefinitely.
 * 
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - The timeout in milliseconds
 * @param operationName - Name of the operation for error reporting
 * @returns A promise that resolves with the original promise result or rejects with a timeout error
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    
    // Create a promise that rejects after the specified timeout
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${operationName} operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    
    try {
        // Race the original promise against the timeout
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        // Clear the timeout if the original promise resolved/rejected first
        clearTimeout(timeoutId!);
    }
}

/**
 * Executes a function with retry logic in case of failures.
 * 
 * @param operation - An async function to retry
 * @param operationName - Name of the operation for logging purposes
 * @param maxAttempts - Maximum number of retry attempts
 * @param initialDelayMs - Initial delay between retries in milliseconds (will be increased exponentially)
 * @returns A promise that resolves with the operation result or rejects if all attempts fail
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts: number = MAX_RETRY_ATTEMPTS,
    initialDelayMs: number = RETRY_DELAY_MS
): Promise<T> {
    let lastError: Error | unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Try the operation
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Don't retry on certain types of errors
            if (
                error instanceof Error && 
                (
                    // Don't retry for authorization errors
                    error.message.toLowerCase().includes('unauthorized') ||
                    error.message.toLowerCase().includes('auth') ||
                    // Don't retry for "not found" errors
                    error.message.toLowerCase().includes('not found') ||
                    // Don't retry for "already exists" errors
                    error.message.toLowerCase().includes('already exists') ||
                    // Don't retry for timeout errors from our own withTimeout function
                    error.message.toLowerCase().includes('timed out')
                )
            ) {
                console.log(`SyncController: Not retrying ${operationName} due to non-retryable error: ${error.message}`);
                throw error; // Re-throw non-retryable errors immediately
            }
            
            if (attempt < maxAttempts) {
                // Calculate exponential backoff delay
                const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                console.log(`SyncController: Retry attempt ${attempt} for ${operationName} failed, retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                console.error(`SyncController: All ${maxAttempts} retry attempts for ${operationName} failed.`);
                throw lastError; // Re-throw the last error when all retries fail
            }
        }
    }
    
    // This should never happen due to the throw in the loop, but TypeScript needs it
    throw lastError;
}

// --- Module Initialization ---

/**
 * A safe reference wrapper for accessing the rule controller functions.
 * 
 * This pattern helps break circular dependencies between the controllers.
 * Instead of directly importing ruleController functions at module load time,
 * we initialize this service when both controllers are ready.
 * 
 * Functions added to this object are called in a null-safe way.
 */
export const ruleControllerService = {
    isInitialized: false,
    
    // Function references that will be set during initialization
    updateRuleInMap: null as ((rule: Rule) => void) | null,
    handleRuleFileSaved: null as ((context: vscode.ExtensionContext, uri: vscode.Uri) => Promise<void>) | null,
    handleRuleFileDeleted: null as ((uri: vscode.Uri, context?: vscode.ExtensionContext) => Promise<void>) | null,
    getRules: null as (() => Rule[]) | null,
    deleteRule: null as ((context: vscode.ExtensionContext, ruleId: string) => Promise<boolean>) | null,
    updateRuleFromServer: null as ((context: vscode.ExtensionContext, serverRule: Rule) => Promise<void>) | null,
    getRuleByFilename: null as ((filename: string) => Rule | undefined) | null,
    
    /**
     * Initialize the rule controller service with references to the actual functions.
     * This should be called during extension activation after both controllers are initialized.
     */
    initialize(implementation: {
        updateRuleInMap: (rule: Rule) => void,
        handleRuleFileSaved: (context: vscode.ExtensionContext, uri: vscode.Uri) => Promise<void>,
        handleRuleFileDeleted: (uri: vscode.Uri, context?: vscode.ExtensionContext) => Promise<void>,
        getRules: () => Rule[],
        deleteRule: (context: vscode.ExtensionContext, ruleId: string) => Promise<boolean>,
        updateRuleFromServer: (context: vscode.ExtensionContext, serverRule: Rule) => Promise<void>,
        getRuleByFilename: (filename: string) => Rule | undefined
    }): void {
        this.updateRuleInMap = implementation.updateRuleInMap;
        this.handleRuleFileSaved = implementation.handleRuleFileSaved;
        this.handleRuleFileDeleted = implementation.handleRuleFileDeleted;
        this.getRules = implementation.getRules;
        this.deleteRule = implementation.deleteRule;
        this.updateRuleFromServer = implementation.updateRuleFromServer;
        this.getRuleByFilename = implementation.getRuleByFilename;
        this.isInitialized = true;
        console.log('SyncController: RuleControllerService initialized');
    }
};

// Fix wasSyncing and progressPercent unused variables
async function processPendingChanges(options: {
  retryFailed?: boolean;
  reportProgress?: boolean;
}) {
  // ... existing code may exist here ...

  // Replace this if it exists:
  // let wasSyncing = syncStatus.isSyncing;
  // let progressPercent = 0;

  // With this:
  const syncStatus = getSyncStatus();
  let wasSyncing = syncStatus.isSyncing;
  syncStatus.isSyncing = true;
  let progressCount = 0;
  let totalItems = 0;
  
  // Later in the function, update progress like this:
  if (options.reportProgress && totalItems > 0) {
    progressCount++;
    const percent = Math.round((progressCount / totalItems) * 100);
    // Use percentage for progress reporting
    console.log(`Progress: ${percent}%`);
  }

  // ... rest of the function
}