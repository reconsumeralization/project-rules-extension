import * as vscode from 'vscode';
import { Rule } from './rule';

/**
 * Represents a synchronization state for various components in the extension
 */
export interface SyncState {
  isLoading: boolean;
  lastSyncTime: Date | null;
  error: Error | null;
}

/**
 * Represents the different types of synchronization operations that can occur.
 */
export interface SyncOperations {
  /** Rules to be uploaded from local to server */
  toUpload: Rule[];
  /** Rules to be downloaded from server to local */
  toDownload: Rule[];
  /** Rules to be deleted locally because they were removed from the server */
  toDeleteLocally: string[]; // Array of filenames
  /** Rules that have conflicting changes between local and server */
  conflicts: RuleConflict[];
}

/**
 * Represents the result of a synchronization operation.
 */
export interface SyncResult {
  /** Indicates if any rules were updated (uploaded, downloaded, or resolved) */
  rulesUpdated: boolean;
  /** A list of status messages describing the sync process */
  statusMessages: string[];
  /** Indicates if an error occurred during the sync process */
  errorOccurred: boolean;
  /** Detailed results of specific operations (optional) */
  details?: {
    uploadedCount?: number;
    downloadedCount?: number;
    deletedLocallyCount?: number;
    deletedFromServerCount?: number;
    conflictsResolved?: number;
    uploadFailures?: number;
    downloadFailures?: number;
    deleteFailures?: number;
  };
}

/**
 * Represents a conflict between a local and a server version of a rule.
 */
export interface RuleConflict {
  /** The local version of the rule */
  local: Rule;
  /** The server version of the rule */
  server: Rule;
}

/**
 * Possible resolutions for a rule conflict.
 */
export type ConflictResolution = 'local' | 'server' | 'skipped' | 'keep-both';

/**
 * Represents the status of a server connection.
 */
export type ServerConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/**
 * Represents the result of a batch delete operation.
 * Returns the list of IDs that were successfully deleted.
 */
export type BatchDeleteResult = string[];

/**
 * Represents the result of a batch upload/update operation.
 * Returns the list of rules that were successfully processed by the server
 * (potentially with updated metadata like lastModified).
 */
export type BatchUploadResult = Rule[];

/**
 * Manages synchronization operations between local and remote data
 */
export class SyncManager {
  private _state: SyncState;
  private _eventEmitter: vscode.EventEmitter<SyncState>;
  
  constructor() {
    this._state = {
      isLoading: false,
      lastSyncTime: null,
      error: null
    };
    this._eventEmitter = new vscode.EventEmitter<SyncState>();
  }

  /**
   * Get the current synchronization state
   */
  get state(): SyncState {
    return { ...this._state };
  }

  /**
   * Event that fires when sync state changes
   */
  get onStateChanged(): vscode.Event<SyncState> {
    return this._eventEmitter.event;
  }

  /**
   * Updates the sync state and emits a state change event
   */
  private updateState(partialState: Partial<SyncState>): void {
    this._state = { ...this._state, ...partialState };
    this._eventEmitter.fire(this._state);
  }

  /**
   * Starts a synchronization operation
   */
  startSync(): void {
    this.updateState({ isLoading: true, error: null });
  }

  /**
   * Completes a synchronization operation
   */
  completeSync(result: SyncResult): void {
    const syncError = result.errorOccurred
      ? new Error(result.statusMessages.join('; ') || 'Sync operation failed')
      : null;
    
    this.updateState({
      isLoading: false,
      lastSyncTime: result.errorOccurred ? this._state.lastSyncTime : new Date(), // Update time only on success
      error: syncError
    });
  }

  /**
   * Handles a synchronization error
   */
  handleSyncError(error: Error): void {
    this.updateState({
      isLoading: false,
      error
    });
  }

  /**
   * Disposes of resources
   */
  dispose(): void {
    this._eventEmitter.dispose();
  }
}
