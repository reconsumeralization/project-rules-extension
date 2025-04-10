import * as vscode from 'vscode';

/**
 * Represents a synchronization state for various components in the extension
 */
export interface SyncState {
  isLoading: boolean;
  lastSyncTime: Date | null;
  error: Error | null;
}

/**
 * Represents a synchronization operation result
 */
export interface SyncResult {
  success: boolean;
  message: string;
  timestamp: Date;
  data?: any;
  error?: Error;
}

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
    this.updateState({
      isLoading: false,
      lastSyncTime: result.timestamp,
      error: result.success ? null : (result.error || new Error(result.message))
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
