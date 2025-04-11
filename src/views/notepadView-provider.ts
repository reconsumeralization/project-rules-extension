import * as vscode from 'vscode'
import * as path from 'path'
import { getNonce } from '../utils'
import { NotepadService } from '../services/notepadService'
import { NotepadAIService } from '../services/notepadAIService'

/**
 * Provider for the notepad webview
 */
export class NotepadViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'projectRules.notepadView'
  
  private _view?: vscode.WebviewView
  private _notepadService: NotepadService
  private _notepadAIService: NotepadAIService
  private _pendingOperations: Map<string, Promise<any>> = new Map()
  private _isProcessing: boolean = false
  
  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    notepadService: NotepadService,
    notepadAIService: NotepadAIService
  ) {
    this._notepadService = notepadService
    this._notepadAIService = notepadAIService
    
    // Listen for notepad changes to update the webview
    this._notepadService.onNotepadsChanged(() => {
      this._sendNotepads()
    })
  }
  
  /**
   * Called when the view is first created
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView
    
    // Set webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionContext.extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionContext.extensionUri, 'dist', 'webview')
      ]
    }
    
    // Set the HTML content and initialize UI
    const initializationTasks = [
      // Set the webview HTML content
      Promise.resolve().then(() => {
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
      }),
      
      // Pre-load any data needed for initialization
      Promise.resolve().then(async () => {
        // We could pre-load templates, recent notepads, etc.
        await this._preloadData()
      })
    ]
    
    // Run initialization tasks in parallel
    Promise.all(initializationTasks)
      .catch(error => {
        console.error('Error initializing notepad view:', error)
      })
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      // For batch operations, use the batch handler
      if (message.command === 'batchOperation') {
        this._handleBatchOperation(message.operations)
        return
      }
      
      switch (message.command) {
        case 'getNotepads':
          this._sendNotepads()
          break
          
        case 'getNotepad':
          this._sendNotepad(message.notepadId)
          break
          
        case 'createNotepad':
          this._createNotepad(message.notepad)
          break
          
        case 'updateNotepad':
          this._updateNotepad(message.notepadId, message.updates)
          break
          
        case 'deleteNotepad':
          this._deleteNotepad(message.notepadId)
          break
          
        case 'addAttachment':
          this._addAttachment(message.notepadId)
          break
          
        case 'removeAttachment':
          this._removeAttachment(message.notepadId, message.attachmentId)
          break
          
        case 'createFromTemplate':
          this._createFromTemplate(message.templateId, message.title)
          break
          
        case 'generateContent':
          this._generateContent(message.prompt)
          break
          
        case 'analyzeReferences':
          this._analyzeReferences(message.notepadId)
          break
          
        case 'suggestImprovements':
          this._suggestImprovements(message.notepadId)
          break
          
        case 'generateTemplate':
          this._generateTemplate(message.purpose)
          break
          
        case 'openFileInEditor':
          this._openFileInEditor(message.filePath)
          break
          
        case 'parallelOperation':
          this._handleParallelOperation(message.operations, message.operationId)
          break
      }
    })
  }
  
  /**
   * Preload data for faster initial rendering
   */
  private async _preloadData(): Promise<void> {
    // This could load templates, recent notepads, or other data
    // needed for faster initial rendering
  }
  
  /**
   * Handle batch operation requests from the webview
   */
  private async _handleBatchOperation(operations: Array<{command: string, params: any}>): Promise<void> {
    if (!this._view) return
    
    // Show loading state in UI
    this._view.webview.postMessage({
      command: 'batchOperationStarted'
    })
    
    try {
      // Process operations in parallel
      const operationPromises = operations.map(op => {
        switch (op.command) {
          case 'createNotepad':
            return this._notepadService.createNotepad(op.params)
              .then(notepad => ({ success: true, command: op.command, data: notepad }))
              .catch(error => ({ success: false, command: op.command, error: error.message }))
              
          case 'updateNotepad':
            return this._notepadService.updateNotepad(op.params.id, op.params.updates)
              .then(notepad => ({ success: true, command: op.command, data: notepad }))
              .catch(error => ({ success: false, command: op.command, error: error.message }))
              
          case 'deleteNotepad':
            return this._notepadService.deleteNotepad(op.params.id)
              .then(() => ({ success: true, command: op.command }))
              .catch(error => ({ success: false, command: op.command, error: error.message }))
              
          default:
            return Promise.resolve({ success: false, command: op.command, error: 'Unsupported operation' })
        }
      })
      
      // Wait for all operations to complete
      const results = await Promise.all(operationPromises)
      
      // Send results back to the webview
      this._view.webview.postMessage({
        command: 'batchOperationCompleted',
        results
      })
      
      // Update the notepads list
      this._sendNotepads()
      
      // Show success message
      const successCount = results.filter(r => r.success).length
      this._showNotification(`Successfully completed ${successCount} of ${operations.length} operations`)
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Batch operation failed: ${message}`, 'error')
      
      this._view.webview.postMessage({
        command: 'batchOperationFailed',
        error: message
      })
    }
  }
  
  /**
   * Handle parallel operations with progress tracking
   */
  private async _handleParallelOperation(
    operations: Array<{command: string, params: any}>,
    operationId: string
  ): Promise<void> {
    if (!this._view) return
    
    // Create a new operation promise
    const operationPromise = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Processing Notepad Operations',
        cancellable: true
      },
      async (progress, token) => {
        // Initialize progress
        progress.report({ increment: 0 });
        
        const results: any[] = [];
        const totalOps = operations.length;
        let completedOps = 0;
        
        // Setup cancellation
        token.onCancellationRequested(() => {
          this._view?.webview.postMessage({
            command: 'operationCancelled',
            operationId
          });
        });
        
        for (const op of operations) {
          if (token.isCancellationRequested) break;
          
          try {
            // Process the operation
            let result;
            switch (op.command) {
              case 'createNotepad':
                result = await this._notepadService.createNotepad(op.params);
                break;
              case 'updateNotepad':
                result = await this._notepadService.updateNotepad(op.params.id, op.params.updates);
                break;
              case 'suggestImprovements':
                const aiResult = await this._notepadAIService.suggestImprovements(op.params.id);
                result = aiResult.success ? aiResult.data : null;
                break;
              // Add other operations as needed
            }
            
            results.push({ success: true, data: result, command: op.command });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.push({ success: false, error: message, command: op.command });
          }
          
          // Update progress
          completedOps++;
          progress.report({ 
            increment: (100 / totalOps),
            message: `Completed ${completedOps} of ${totalOps} operations`
          });
        }
        
        return results;
      }
    ) as Promise<any[]>;
    
    // Store the operation
    this._pendingOperations.set(operationId, operationPromise);
    
    try {
      // Wait for operation to complete
      const results = await operationPromise;
      
      // Send results back to UI
      this._view.webview.postMessage({
        command: 'parallelOperationCompleted',
        operationId,
        results
      });
      
      // Refresh notepads list
      this._sendNotepads();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._view.webview.postMessage({
        command: 'parallelOperationFailed',
        operationId,
        error: message
      });
    } finally {
      // Clean up
      this._pendingOperations.delete(operationId);
    }
  }
  
  /**
   * Execute multiple operations in parallel
   */
  private async _executeParallel<T>(
    operations: Array<() => Promise<T>>
  ): Promise<Array<{ success: boolean; data?: T; error?: string }>> {
    return Promise.all(
      operations.map(async (operation) => {
        try {
          const result = await operation();
          return { success: true, data: result };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, error: message };
        }
      })
    );
  }
  
  /**
   * Refresh the webview content
   */
  public refresh(): void {
    if (this._view) {
      this._sendNotepads()
    }
  }
  
  /**
   * Send the list of notepads to the webview
   */
  private _sendNotepads(): void {
    if (!this._view) {return}
    
    const notepads = this._notepadService.getNotepads()
    this._view.webview.postMessage({
      command: 'notepadList',
      data: notepads
    })
  }
  
  /**
   * Send details of a specific notepad to the webview
   */
  private _sendNotepad(notepadId: string): void {
    if (!this._view) {return}
    
    const notepad = this._notepadService.getNotepad(notepadId)
    if (notepad) {
      this._view.webview.postMessage({
        command: 'notepad',
        data: notepad
      })
    } else {
      this._showNotification(`Notepad with ID ${notepadId} not found`, 'error')
    }
  }
  
  /**
   * Create a new notepad
   */
  private async _createNotepad(data: { title: string; content: string; tags?: string[] }): Promise<void> {
    if (!this._view) {return}
    
    try {
      const notepad = await this._notepadService.createNotepad({
        title: data.title,
        content: data.content,
        tags: data.tags
      })
      
      this._view.webview.postMessage({
        command: 'notepadCreated',
        data: notepad
      })
      
      this._showNotification(`Notepad "${data.title}" created`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to create notepad: ${message}`, 'error')
    }
  }
  
  /**
   * Update an existing notepad
   */
  private async _updateNotepad(notepadId: string, updates: any): Promise<void> {
    if (!this._view) {return}
    
    try {
      const notepad = await this._notepadService.updateNotepad(notepadId, updates)
      
      this._view.webview.postMessage({
        command: 'notepadUpdated',
        data: notepad
      })
      
      this._showNotification(`Notepad "${notepad.title}" updated`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to update notepad: ${message}`, 'error')
    }
  }
  
  /**
   * Delete a notepad
   */
  private async _deleteNotepad(notepadId: string): Promise<void> {
    if (!this._view) {return}
    
    try {
      await this._notepadService.deleteNotepad(notepadId)
      
      this._view.webview.postMessage({
        command: 'notepadDeleted',
        data: { id: notepadId }
      })
      
      this._showNotification('Notepad deleted')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to delete notepad: ${message}`, 'error')
    }
  }
  
  /**
   * Add an attachment to a notepad
   */
  private async _addAttachment(notepadId: string): Promise<void> {
    if (!this._view) {return}
    
    // Show file picker
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Attach File'
    })
    
    if (!uris || uris.length === 0) {return}
    
    try {
      const notepad = await this._notepadService.addAttachment(notepadId, uris[0])
      
      this._view.webview.postMessage({
        command: 'notepadUpdated',
        data: notepad
      })
      
      this._showNotification('File attached successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to attach file: ${message}`, 'error')
    }
  }
  
  /**
   * Remove an attachment from a notepad
   */
  private async _removeAttachment(notepadId: string, attachmentId: string): Promise<void> {
    if (!this._view) {return}
    
    try {
      const notepad = await this._notepadService.removeAttachment(notepadId, attachmentId)
      
      this._view.webview.postMessage({
        command: 'notepadUpdated',
        data: notepad
      })
      
      this._showNotification('Attachment removed')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to remove attachment: ${message}`, 'error')
    }
  }
  
  /**
   * Create a notepad from a template
   */
  private async _createFromTemplate(templateId: string, title: string): Promise<void> {
    if (!this._view) {return}
    
    try {
      const notepad = await this._notepadService.createFromTemplate(templateId, title)
      
      this._view.webview.postMessage({
        command: 'notepadCreated',
        data: notepad
      })
      
      this._showNotification(`Notepad "${title}" created from template`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to create from template: ${message}`, 'error')
    }
  }
  
  /**
   * Generate content for a notepad using AI
   */
  private async _generateContent(prompt: string): Promise<void> {
    if (!this._view) {return}
    
    this._showNotification('Generating content...', 'info')
    
    try {
      const result = await this._notepadAIService.generateContent(prompt)
      
      if (result.success) {
        this._view.webview.postMessage({
          command: 'contentGenerated',
          data: { content: result.data }
        })
      } else {
        this._showNotification(`Failed to generate content: ${result.error}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Error generating content: ${message}`, 'error')
    }
  }
  
  /**
   * Analyze references in a notepad using AI
   */
  private async _analyzeReferences(notepadId: string): Promise<void> {
    if (!this._view) {return}
    
    this._showNotification('Analyzing references...', 'info')
    
    try {
      const result = await this._notepadAIService.analyzeReferences(notepadId)
      
      if (result.success) {
        this._view.webview.postMessage({
          command: 'referencesAnalyzed',
          data: result.data
        })
      } else {
        this._showNotification(`Failed to analyze references: ${result.error}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Error analyzing references: ${message}`, 'error')
    }
  }
  
  /**
   * Suggest improvements for a notepad using AI
   */
  private async _suggestImprovements(notepadId: string): Promise<void> {
    if (!this._view) {return}
    
    this._showNotification('Suggesting improvements...', 'info')
    
    try {
      const result = await this._notepadAIService.suggestImprovements(notepadId)
      
      if (result.success) {
        this._view.webview.postMessage({
          command: 'improvementsSuggested',
          data: result.data
        })
      } else {
        this._showNotification(`Failed to suggest improvements: ${result.error}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Error suggesting improvements: ${message}`, 'error')
    }
  }
  
  /**
   * Generate a notepad template using AI
   */
  private async _generateTemplate(purpose: string): Promise<void> {
    if (!this._view) {return}
    
    this._showNotification('Generating template...', 'info')
    
    try {
      const result = await this._notepadAIService.generateTemplate(purpose)
      
      if (result.success) {
        this._view.webview.postMessage({
          command: 'templateGenerated',
          data: result.data
        })
        
        this._showNotification(`Template for "${purpose}" generated`)
      } else {
        this._showNotification(`Failed to generate template: ${result.error}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Error generating template: ${message}`, 'error')
    }
  }
  
  /**
   * Open a file in the editor
   */
  private async _openFileInEditor(filePath: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (!workspaceFolder) {
        throw new Error('No workspace folder open')
      }
      
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath)
      const document = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(document)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this._showNotification(`Failed to open file: ${message}`, 'error')
    }
  }
  
  /**
   * Show a notification in the webview
   */
  private _showNotification(text: string, type: 'info' | 'error' = 'info'): void {
    if (!this._view) {return}
    
    this._view.webview.postMessage({
      command: 'notification',
      data: { text, type }
    })
  }
  
  /**
   * Returns the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs of resources to include in the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'dist', 'webview', 'notepadView.js')
    )
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'dist', 'webview', 'notepadView.css')
    )
    
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionContext.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    )
    
    // Create a nonce to only allow specific scripts to be run
    const nonce = getNonce()
    
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsUri}" rel="stylesheet">
        <title>Notepads</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `
  }
} 