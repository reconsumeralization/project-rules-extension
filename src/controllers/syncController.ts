import * as vscode from 'vscode'
import * as path from 'path'
import { Rule, RuleMetadata, createRuleFromFileContent } from '../models/rule'
import * as localStorageService from '../services/localStorageService'
import * as ruleController from './ruleController'
import { ServerService } from '../services/serverService'
import { SyncOperations, SyncResult, RuleConflict } from '../models/rule'

// --- Module State ---

const DELETED_RULES_QUEUE_KEY = 'deletedRuleIdsToSync';

let syncIntervalTimer: NodeJS.Timeout | null = null
let isSyncing = false
let pendingSync = false
let deletedRuleIdsToSync = new Set<string>() // In-memory queue, loaded on init
let context: vscode.ExtensionContext | null = null
let serverServiceInstance: ServerService | null = null

// --- Helper Functions ---

/**
 * Gets the configured sync interval in milliseconds. Returns 0 if disabled.
 */
function getSyncIntervalMs(): number {
    const intervalSeconds = vscode.workspace
        .getConfiguration('ProjectRules')
        .get<number>('syncInterval') ?? 300
    return intervalSeconds > 0 ? intervalSeconds * 1000 : 0
}

/**
 * Shows a diff view between a local and server rule version.
 */
async function showConflictDiff(localRule: Rule, serverRule: Rule): Promise<void> {
    const ext = path.extname(localRule.metadata.filename) || '.mdc';
    const baseName = path.basename(localRule.metadata.filename, ext);
    // Ensure unique URIs for diff view if called multiple times
    const timestamp = Date.now(); 
    const localUri = vscode.Uri.parse(`untitled:${baseName}.local-${timestamp}${ext}?conflict=local&id=${localRule.metadata.id}`)
    const serverUri = vscode.Uri.parse(`untitled:${baseName}.server-${timestamp}${ext}?conflict=server&id=${localRule.metadata.id}`)
    try {
        await vscode.workspace.fs.writeFile(localUri, Buffer.from(localRule.content, 'utf8'))
        await vscode.workspace.fs.writeFile(serverUri, Buffer.from(serverRule.content, 'utf8'))
        const diffTitle = `${localRule.metadata.filename}: Local ↔ Server Conflict`
        await vscode.commands.executeCommand('vscode.diff', localUri, serverUri, diffTitle)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to show diff for rule "${localRule.metadata.filename}": ${message}`);
        console.error("Diff error:", error)
    }
}

/**
 * Handles conflict resolution between a local and server rule.
 * Returns 'local', 'server', or 'skipped'. Updates state if skipped.
 */
async function resolveConflict(context: vscode.ExtensionContext, localRule: Rule, serverRule: Rule): Promise<'local' | 'server' | 'skipped'> {
    // Let's provide a more detailed message to help the user make an informed decision
    const localDate = new Date(localRule.metadata.lastModified).toLocaleString();
    const serverDate = new Date(serverRule.metadata.lastModified).toLocaleString();
    
    const message = `Conflict detected for rule "${localRule.metadata.filename}"
    • Local version last modified: ${localDate}
    • Server version last modified: ${serverDate}

Which version do you want to keep?`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Keep Local', 
      'Keep Server', 
      'Compare', 
      'Keep Both (Renamed)', 
      'Mark as Conflict'
    )
    
    if (choice === 'Keep Local') return 'local';
    if (choice === 'Keep Server') return 'server';
    
    if (choice === 'Compare') {
        await showConflictDiff(localRule, serverRule);
        // Re-ask after showing diff
        return resolveConflict(context, localRule, serverRule);
    } 
    
    if (choice === 'Keep Both (Renamed)') {
        // Create a new local rule with a renamed filename
        const ext = path.extname(localRule.metadata.filename);
        const baseName = path.basename(localRule.metadata.filename, ext);
        const newFilename = `${baseName}-local-copy${ext}`;
        
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
            await ruleController.handleRuleFileSaved(context, saveResult.uri);
            console.log(`Created local copy as ${newFilename}`);
            vscode.window.showInformationMessage(`Created local copy as "${newFilename}" and keeping server version.`);
        } else {
            console.error(`Failed to create local copy of rule ${localRule.metadata.filename}`);
            vscode.window.showErrorMessage(`Failed to create local copy. Using server version only.`);
        }
        
        // Return server for the original file path
        return 'server';
    }
    
    if (choice === 'Mark as Conflict') {
        // Explicitly mark as conflict and keep local content
        const conflictedRule = createRuleFromFileContent({ 
            id: localRule.metadata.id,
            filename: localRule.metadata.filename,
            content: localRule.content, // Keep local content
            lastModified: localRule.metadata.lastModified, 
            syncStatus: 'conflict' // Set status
        });
        
        const saveResult = await localStorageService.saveRule(context, conflictedRule);
        if (saveResult) {
            await ruleController.handleRuleFileSaved(context, saveResult.uri);
            console.log(`Marked ${localRule.metadata.filename} as conflicted locally.`);
            vscode.window.showInformationMessage(`Rule "${localRule.metadata.filename}" marked as conflict. Resolve later.`);
        } else {
            console.error(`Failed to save conflicted state for rule ${localRule.metadata.filename}`);
        }
        return 'skipped';
    }
    
    // Default case (user dismissed dialog) - Mark as conflict
    console.log(`Conflict resolution skipped for ${localRule.metadata.filename}. Marking as conflict.`);
    const conflictedRule = createRuleFromFileContent({ 
        id: localRule.metadata.id,
        filename: localRule.metadata.filename,
        content: localRule.content, // Keep local content
        lastModified: localRule.metadata.lastModified, 
        syncStatus: 'conflict' // Set status
    });
    
    const saveResult = await localStorageService.saveRule(context, conflictedRule);
    if (saveResult) {
        await ruleController.handleRuleFileSaved(context, saveResult.uri);
        console.log(`Marked ${localRule.metadata.filename} as conflicted locally.`);
    } else {
        console.error(`Failed to save conflicted state for rule ${localRule.metadata.filename}`);
    }
    return 'skipped';
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

    let statusMessages: string[] = []
    let errorOccurred = false
    let rulesUpdated = false

    try {
        // 1. Fetch Server Rules
        progress.report({ message: 'Fetching server rules...' });
        const serverRules = await serverServiceInstance.fetchRules()
        const serverRulesMap = new Map(serverRules.map(rule => [rule.metadata.id, rule]))
        console.log(`SyncController: Fetched ${serverRulesMap.size} rules from server.`)

        // 2. Get Local Rules (from controller)
        progress.report({ message: 'Comparing rules...' });
        const localRules = ruleController.getRules()
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
                if (localRule.metadata.syncStatus !== 'server-only') rulesToUpload.push(localRule)
            } else {
                if (localRule.metadata.lastModified > serverRule.metadata.lastModified) rulesToUpload.push(localRule)
                else if (localRule.metadata.lastModified < serverRule.metadata.lastModified) rulesToDownload.push(serverRule)
                else if (localRule.content !== serverRule.content && localRule.metadata.syncStatus !== 'conflict') conflicts.push({ local: localRule, server: serverRule })
            }
        }
        // Compare Server vs Local
        for (const [id, serverRule] of serverRulesMap.entries()) {
            if (!localRulesMap.has(id)) rulesToDownload.push(serverRule)
        }
        for (const [id, localRule] of localRulesMap.entries()) {
             if (!serverRulesMap.has(id) && !rulesToUpload.some(r => r.metadata.id === id))
                 if (localRule.metadata.syncStatus === 'synced' || localRule.metadata.syncStatus === 'conflict')
                     rulesToDeleteLocally.push(localRule.metadata.filename)
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
                if (resolution === 'local') resolvedUploads.push(conflict.local)
                if (resolution === 'server') resolvedDownloads.push(conflict.server)
                if (resolution !== 'skipped') rulesUpdated = true
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
                    if(ruleUri) await ruleController.handleRuleFileDeleted(ruleUri, context) // Pass context for server deletion handling
                    deletedCount++
                    rulesUpdated = true
                }
            }
            if (deletedCount > 0) statusMessages.push(`${deletedCount} rule(s) deleted locally.`);
        }

        // 6. Process Server Deletions
        const idsToDelete = Array.from(deletedRuleIdsToSync);
        if (idsToDelete.length > 0) {
            progress.report({ message: `Deleting rules from server...` });
            let deletedCount = 0;
            let failedCount = 0;
            const stillQueued: string[] = [];
            const batchSize = 20; // Process in batches

            for (let i = 0; i < idsToDelete.length; i += batchSize) {
                const batch = idsToDelete.slice(i, i + batchSize);
                try {
                    const results = await serverServiceInstance.deleteRule(batch[0]);
                    // Assuming results indicate success/failure per ID or overall success
                    deletedCount += batch.length; // Adjust based on actual results if available
                } catch (delErr) {
                    console.error(`SyncController: Failed to delete server rule batch (start index ${i}):`, delErr);
                    // vscode.window.showWarningMessage(`Failed to delete some rules from server. Check logs.`) // Too noisy?
                    // Assume entire batch failed for now, keep them in the queue
                    stillQueued.push(...batch);
                    failedCount += batch.length;
                    errorOccurred = true;
                    const message = delErr instanceof Error ? delErr.message : String(delErr);
                    statusMessages.push(`Server delete failed: ${message}`);
                }
            }

            // Update the queue with only the failed ones
            await context.globalState.update(DELETED_RULES_QUEUE_KEY, stillQueued);
            // Update in-memory set as well
            deletedRuleIdsToSync = new Set(stillQueued);

            if (deletedCount > 0) {
                statusMessages.push(`${deletedCount} rule(s) deleted from server.`);
                rulesUpdated = true;
            }
             if (failedCount > 0) {
                statusMessages.push(`${failedCount} server rule deletion(s) failed, will retry.`);
            }
        }

        // 7. Process Uploads
        if (uniqueUploadQueue.length > 0) {
            progress.report({ message: `Uploading ${uniqueUploadQueue.length} rule(s)...` });
            let uploadedCount = 0;
            let uploadFailedCount = 0;
            const batchSize = 10; // Adjust batch size as needed

            for (let i = 0; i < uniqueUploadQueue.length; i += batchSize) {
                const batch = uniqueUploadQueue.slice(i, i + batchSize);
                try {
                    const uploadedRules = await serverServiceInstance.uploadRules(batch);
                    // Update local state for successfully uploaded rules
                    for (const rule of uploadedRules) {
                         const ruleWithSyncedStatus: Rule = { 
                            ...rule, 
                            metadata: { ...rule.metadata, syncStatus: 'synced' } 
                         };
                        await localStorageService.saveRule(context, ruleWithSyncedStatus);
                        // Update rule in controller without triggering another sync
                        ruleController.updateRuleInMap(ruleWithSyncedStatus);
                        uploadedCount++;
                    }
                } catch (uploadError) {
                    console.error(`SyncController: Failed to upload rule batch (start index ${i}):`, uploadError);
                    uploadFailedCount += batch.length;
                    errorOccurred = true;
                    const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
                    statusMessages.push(`Upload failed: ${message}`);
                    // Optionally mark these rules as conflict or local-only for retry?
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
            for (const serverRule of uniqueDownloadQueue) {
                try {
                    // Mark rule as synced before saving
                     const ruleToSave: Rule = { 
                         ...serverRule, 
                         metadata: { ...serverRule.metadata, syncStatus: 'synced' } 
                     };
                    const saveResult = await localStorageService.saveRule(context, ruleToSave)
                    if (saveResult) {
                        await ruleController.handleRuleFileSaved(context, saveResult.uri) // Notify controller
                        downloadedCount++
                        rulesUpdated = true
                    }
                } catch (error) {
                    console.error(`SyncController: Failed to save downloaded rule ${serverRule.metadata.filename}:`, error)
                    // vscode.window.showWarningMessage(`Failed to save downloaded rule ${serverRule.metadata.filename}. It might be open with unsaved changes.`);
                    const message = error instanceof Error ? error.message : String(error);
                    vscode.window.showWarningMessage(`Failed to save downloaded rule ${serverRule.metadata.filename}: ${message}.`);
                    errorOccurred = true;
                    statusMessages.push(`Download save failed: ${message}`);
                }
            }
            if (downloadedCount > 0) {
                statusMessages.push(`${downloadedCount} rule(s) downloaded.`);
            }
        }

        if (!rulesUpdated && statusMessages.length === 0 && !errorOccurred) {
            statusMessages.push('Rules are up to date.');
        }

    } catch (error) {
        console.error('SyncController: Error during sync process:', error)
        // vscode.window.showErrorMessage(`Sync failed: ${error.message}`)
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Sync failed: ${message}`);
        errorOccurred = true;
        statusMessages.push(`Sync aborted due to error: ${message}`);
        // Re-throw or handle differently?
    }

    return { rulesUpdated, statusMessages, errorOccurred };
}

// --- Exported Controller Functions ---

/**
 * Initializes the sync controller state, e.g., loading the deleted rules queue.
 */
export function initializeSyncController(ctx: vscode.ExtensionContext, serverService: ServerService): void {
    console.log('Initializing SyncController...');
    context = ctx;
    serverServiceInstance = serverService;
    const deletedIds = ctx.globalState.get<string[]>(DELETED_RULES_QUEUE_KEY, []);
    deletedRuleIdsToSync = new Set(deletedIds);
    console.log(`SyncController: Initialized with ${deletedRuleIdsToSync.size} rule IDs queued for server deletion.`);
    
    // Optionally, listen to server connection status changes
    serverServiceInstance.onStatusChanged((status) => {
        console.log(`SyncController: Noticed server status changed to ${status}`);
        // Maybe trigger sync on connect?
        if (status === 'connected') {
            // Consider delaying or debouncing this
            console.log('SyncController: Server connected, triggering background sync.')
            syncRules(ctx, true); // Trigger background sync on connect
        }
    });
}

/**
 * Starts the background synchronization timer based on configuration.
 */
export function startBackgroundSync(ctx: vscode.ExtensionContext): void {
    if (!serverServiceInstance) {
        console.warn('SyncController: Cannot start background sync, ServerService not initialized.');
        return;
    }
    if (syncIntervalTimer) {
        clearInterval(syncIntervalTimer);
    }

    const intervalSeconds = getSyncIntervalMs() / 1000;

    if (intervalSeconds > 0) {
        console.log(`SyncController: Starting background sync every ${intervalSeconds} seconds.`);
        syncIntervalTimer = setInterval(async () => {
            console.log('SyncController: Triggering background sync...');
            // Ensure context is still valid
            if (context) {
               await syncRules(context, true);
            } else {
                console.warn('SyncController: Background sync skipped, context lost.');
                stopBackgroundSync(); // Stop if context is lost
            }
        }, intervalSeconds * 1000);

        if (intervalSeconds >= 60) {
            const fetchInterval = Math.max(30000, Math.min(30, Math.floor(intervalSeconds / 2)) * 1000);
            console.log(`SyncController: Setting up server fetch checks every ${fetchInterval/1000} seconds.`);
            
            const fetchIntervalTimer = setInterval(async () => {
                if (!isSyncing && context && serverServiceInstance?.getConnectionStatus() === 'connected') { 
                    console.log('SyncController: Checking for server-only changes...');
                    try {
                        await fetchAndApplyServerChanges(context);
                    } catch (error) {
                        console.error("SyncController: Error in fetch check:", error);
                    }
                }
            }, fetchInterval);
            ctx.subscriptions.push({ dispose: () => clearInterval(fetchIntervalTimer) });
        }

        setTimeout(() => {
            if (context) {
                console.log('SyncController: Performing initial background sync.');
                syncRules(context, true);
            } 
        }, 5000);

    } else {
        console.log('SyncController: Background sync is disabled (interval set to 0).');
    }
}

/**
 * Stops the background synchronization timer.
 */
export function stopBackgroundSync(): void {
    if (syncIntervalTimer) {
        console.log('SyncController: Stopping background sync timer.');
        clearInterval(syncIntervalTimer);
        syncIntervalTimer = null;
    }
}

/**
 * Manually triggers a full synchronization cycle.
 */
export async function syncRules(context: vscode.ExtensionContext, background: boolean = false): Promise<void> {
    if (!serverServiceInstance) {
        vscode.window.showWarningMessage("MCP Server URL not configured or service not ready.");
        return;
    }

    if (isSyncing) {
        if (!background) {
            vscode.window.showInformationMessage('Sync already in progress.')
        }
        pendingSync = true // Request another sync after the current one finishes
        return
    }

    isSyncing = true
    pendingSync = false // Reset pending flag
    const startTime = Date.now()

    console.log("SyncController: Starting manual sync...")
    if (!background) {
        vscode.window.setStatusBarMessage('$(sync~spin) Syncing rules...', 5000)
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Syncing Cursor Rules',
                cancellable: false // Add cancellation later?
            },
            async (progress) => {
                const { rulesUpdated, statusMessages, errorOccurred } = await performSync(context, progress);
                const duration = Date.now() - startTime
                console.log(`SyncController: Sync finished in ${duration}ms. Status: ${statusMessages.join(' | ')}`)

                if (!background || errorOccurred) { // Show summary unless background and successful
                     vscode.window.showInformationMessage(`Sync complete (${(duration / 1000).toFixed(1)}s): ${statusMessages.join('. ')}`)
                }

                if (rulesUpdated) {
                    // Refresh views if changes were made
                    vscode.commands.executeCommand('ProjectRules.refreshRulesView');
                    // Any other views needing refresh?
                }
                 // Clear status bar message after a delay
                setTimeout(() => vscode.window.setStatusBarMessage('', 0), 3000);
            }
        )
    } catch (error) {
        // Errors inside performSync are caught there, this catches errors setting up progress etc.
        console.error('SyncController: Unhandled error during sync initiation:', error)
        // vscode.window.showErrorMessage(`Sync initiation failed: ${error.message}`)
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Sync initiation failed: ${message}`);
    } finally {
        isSyncing = false
        // If another sync was requested while this one ran, start it now
        if (pendingSync) {
            console.log('SyncController: Starting pending sync request.')
            pendingSync = false // Reset before starting the new one
            syncRules(context, background).catch(err => {
                console.error('SyncController: Error in pending sync execution:', err)
            });
        }
    }
}

/**
 * Queues a rule ID for deletion from the server on next sync.
 * This is called when a rule is deleted locally and needs to be removed from server.
 */
export async function queueRuleForServerDeletion(context: vscode.ExtensionContext, ruleId: string): Promise<void> {
    deletedRuleIdsToSync.add(ruleId);
    await context.globalState.update(DELETED_RULES_QUEUE_KEY, Array.from(deletedRuleIdsToSync));
    console.log(`SyncController: Queued rule ${ruleId} for server deletion on next sync.`);
}

/**
 * Fetches all rules from the server and applies any changes not related to current sync operations.
 * This can be called periodically to ensure we have latest server rules, even those created elsewhere.
 * Returns the number of rules updated locally.
 */
export async function fetchAndApplyServerChanges(context: vscode.ExtensionContext): Promise<number> {
    if (!serverServiceInstance || serverServiceInstance.getConnectionStatus() !== 'connected') {
        console.log('SyncController: Skipping fetch server changes, not connected.');
        return 0;
    }
    if (isSyncing) {
        console.log('SyncController: Skipping fetch server changes, sync in progress.');
        return 0;
    }

    let changesApplied = 0;
    isSyncing = true; // Use sync lock to prevent concurrent fetches
    console.log('SyncController: Fetching server changes...');

    try {
        const serverRules = await serverServiceInstance.fetchRules();
        const localRules = ruleController.getRules();
        const localRulesMap = new Map(localRules.map(r => [r.metadata.id, r]));
        
        for (const serverRule of serverRules) {
            const localRule = localRulesMap.get(serverRule.metadata.id);
            
            // If rule doesn't exist locally or server has newer version, update it
            // Skip any rules already marked as conflict
            if (!localRule || 
                (serverRule.metadata.lastModified > localRule.metadata.lastModified && 
                 localRule.metadata.syncStatus !== 'conflict')) {
                
                // Use the updateRuleFromServer function from ruleController
                await ruleController.updateRuleFromServer(context, serverRule);
                changesApplied++;
            }
        }
        
        if (changesApplied > 0) {
            console.log(`SyncController: Applied ${changesApplied} changes from server`);
            vscode.window.showInformationMessage(`Updated ${changesApplied} rule(s) from server`);
        } else {
            console.log('SyncController: No new changes found on server');
        }
        
        return changesApplied;
    } catch (error) {
        console.error('SyncController: Error fetching and applying server changes:', error);
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to check for server updates: ${message}`);
        return 0;
    } finally {
        isSyncing = false;
    }
}

// Ensure background sync stops when the extension deactivates
// This relies on the extension's deactivate function calling this or disposing subscriptions
// context?.subscriptions.push({ dispose: stopBackgroundSync }); // Add this in initialize if context is available early

// TODO: Consider adding a way to cancel ongoing syncs if they take too long
// TODO: Add an auto-fetch option that periodically checks for server changes without full sync
// TODO: Consider adding rate limiting for background syncs to prevent excessive server requests