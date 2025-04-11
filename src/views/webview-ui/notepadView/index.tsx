import React, { useState, useEffect, useRef } from 'react'
// NOTE: @vscode/webview-ui-toolkit/react needs to be installed with:
// npm install --save-dev @vscode/webview-ui-toolkit @vscode/webview-ui-toolkit/react
// Using standard HTML elements as fallback until the package is installed
import {
  VSCodeButton,
  VSCodeTextField,
  VSCodeTextArea,
  VSCodeDivider,
  VSCodePanels,
  VSCodePanelTab,
  VSCodePanelView,
  VSCodeTag,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeProgressRing
} from '@vscode/webview-ui-toolkit/react'
import { Notepad } from '../../../models/notepad'

// Type definition for the VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: any): void
  getState(): any
  setState(state: any): void
}

// Initialize VS Code API
const vscode = acquireVsCodeApi()

// Interfaces
interface NotepadViewProps {}

interface Attachment {
  id: string
  name: string
  type: string
  url: string
  size: number
}

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

interface AttachmentListProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
}

interface ReferencedFilesProps {
  references: string[]
  onRefresh: () => void
}

interface TemplateListProps {
  templates: Notepad[]
  onSelect: (templateId: string) => void
}

interface OperationStatus {
  id: string
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  progress: number
  message?: string
  results?: any[]
}

// Generate a unique operation ID
const generateOperationId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

// The main notepad component
function NotepadView() {
  const [notepads, setNotepads] = useState<Notepad[]>([])
  const [selectedNotepad, setSelectedNotepad] = useState<Notepad | null>(null)
  const [editMode, setEditMode] = useState<boolean>(false)
  const [templates, setTemplates] = useState<Notepad[]>([])
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [showTemplates, setShowTemplates] = useState<boolean>(false)
  const [referencesAnalysis, setReferencesAnalysis] = useState<any>(null)
  
  // Form state
  const [formTitle, setFormTitle] = useState<string>('')
  const [formContent, setFormContent] = useState<string>('')
  const [formTags, setFormTags] = useState<string[]>([])
  const [aiPrompt, setAiPrompt] = useState<string>('')
  
  // Operation state for parallel processing
  const [operations, setOperations] = useState<OperationStatus[]>([])
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false)
  
  // Refs to maintain state between renders
  const notificationsRef = useRef<HTMLDivElement>(null)
  
  // Effect to initialize and listen for messages
  useEffect(() => {
    // Request data immediately on load
    vscode.postMessage({ command: 'getNotepads' })
    
    // Set up message listener
    const messageListener = (event: MessageEvent) => {
      const message = event.data
      
      switch (message.command) {
        case 'notepadList':
          const notepads = message.data
          setNotepads(notepads.filter((n: Notepad) => !n.isTemplate))
          setTemplates(notepads.filter((n: Notepad) => n.isTemplate))
          break
          
        case 'notepad':
          setSelectedNotepad(message.data)
          setFormTitle(message.data.title)
          setFormContent(message.data.content)
          setFormTags(message.data.tags || [])
          break
          
        case 'notepadCreated':
          setNotepads(prev => [message.data, ...prev])
          setSelectedNotepad(message.data)
          setIsCreating(false)
          break
          
        case 'notepadUpdated':
          setNotepads(prev => prev.map(n => n.id === message.data.id ? message.data : n))
          setSelectedNotepad(message.data)
          setEditMode(false)
          break
          
        case 'notepadDeleted':
          setNotepads(prev => prev.filter(n => n.id !== message.data.id))
          setSelectedNotepad(null)
          break
          
        case 'contentGenerated':
          setFormContent(message.data.content)
          break
          
        case 'referencesAnalyzed':
          setReferencesAnalysis(message.data)
          break
          
        case 'notification':
          showNotification(message.data.text, message.data.type)
          break
          
        // Handle batch operation responses
        case 'batchOperationStarted':
          setIsProcessingBatch(true)
          break
          
        case 'batchOperationCompleted':
          setIsProcessingBatch(false)
          handleBatchOperationResults(message.results)
          break
          
        case 'batchOperationFailed':
          setIsProcessingBatch(false)
          showNotification(`Batch operation failed: ${message.error}`, 'error')
          break
          
        // Handle parallel operation responses
        case 'parallelOperationCompleted':
          updateOperationStatus(message.operationId, 'completed', 100, message.results)
          break
          
        case 'parallelOperationFailed':
          updateOperationStatus(message.operationId, 'failed', 100, undefined, message.error)
          break
          
        case 'operationCancelled':
          updateOperationStatus(message.operationId, 'cancelled', 100)
          break
          
        case 'operationProgress':
          updateOperationStatus(
            message.operationId,
            'pending',
            message.progress,
            undefined,
            message.message
          )
          break
      }
    }
    
    window.addEventListener('message', messageListener)
    return () => window.removeEventListener('message', messageListener)
  }, [])
  
  // Update the status of an operation
  const updateOperationStatus = (
    id: string,
    status: OperationStatus['status'],
    progress: number,
    results?: any[],
    message?: string
  ) => {
    setOperations(prev => {
      const existingOpIndex = prev.findIndex(op => op.id === id)
      if (existingOpIndex >= 0) {
        const updatedOps = [...prev]
        updatedOps[existingOpIndex] = {
          ...updatedOps[existingOpIndex],
          status,
          progress,
          results,
          message
        }
        
        // Remove completed operations after a delay
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          setTimeout(() => {
            setOperations(prev => prev.filter(op => op.id !== id))
          }, 5000)
        }
        
        return updatedOps
      }
      
      return prev
    })
  }
  
  // Handle results from a batch operation
  const handleBatchOperationResults = (results: any[]) => {
    const errors = results.filter(r => !r.success)
    
    if (errors.length > 0) {
      errors.forEach(error => {
        showNotification(`Error in ${error.command}: ${error.error}`, 'error')
      })
    }
  }
  
  // Execute a batch operation
  const executeBatchOperation = (operations: Array<{command: string, params: any}>) => {
    vscode.postMessage({
      command: 'batchOperation',
      operations
    })
  }
  
  // Execute parallel operations with progress tracking
  const executeParallelOperation = (operations: Array<{command: string, params: any}>) => {
    const operationId = generateOperationId()
    
    // Add operation to state
    setOperations(prev => [
      ...prev,
      {
        id: operationId,
        status: 'pending',
        progress: 0,
        message: 'Starting operation...'
      }
    ])
    
    // Request the operation
    vscode.postMessage({
      command: 'parallelOperation',
      operations,
      operationId
    })
    
    return operationId
  }
  
  // Cancel an ongoing operation
  const cancelOperation = (operationId: string) => {
    vscode.postMessage({
      command: 'cancelOperation',
      operationId
    })
  }
  
  // Example: Batch tag multiple notepads
  const handleBatchTagNotepads = (notepads: Notepad[], tags: string[]) => {
    const operations = notepads.map(notepad => ({
      command: 'updateNotepad',
      params: {
        id: notepad.id,
        updates: {
          tags: [...new Set([...(notepad.tags || []), ...tags])]
        }
      }
    }))
    
    if (operations.length > 5) {
      // For larger operations, use parallel processing with progress
      executeParallelOperation(operations)
    } else {
      // For smaller operations, use batch processing
      executeBatchOperation(operations)
    }
  }
  
  // Create a new notepad
  const handleCreateNotepad = () => {
    if (!formTitle) {
      showNotification('Title is required', 'error')
      return
    }
    
    vscode.postMessage({
      command: 'createNotepad',
      notepad: {
        title: formTitle,
        content: formContent,
        tags: formTags
      }
    })
  }
  
  // Update an existing notepad
  const handleUpdateNotepad = () => {
    if (!selectedNotepad) return
    
    vscode.postMessage({
      command: 'updateNotepad',
      notepadId: selectedNotepad.id,
      updates: {
        title: formTitle,
        content: formContent,
        tags: formTags
      }
    })
  }
  
  // Delete a notepad
  const handleDeleteNotepad = () => {
    if (!selectedNotepad) return
    
    if (confirm(`Are you sure you want to delete "${selectedNotepad.title}"?`)) {
      vscode.postMessage({
        command: 'deleteNotepad',
        notepadId: selectedNotepad.id
      })
    }
  }
  
  // Add an attachment to a notepad
  const handleAddAttachment = () => {
    if (!selectedNotepad) return
    
    vscode.postMessage({
      command: 'addAttachment',
      notepadId: selectedNotepad.id
    })
  }
  
  // Remove an attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    if (!selectedNotepad) return
    
    vscode.postMessage({
      command: 'removeAttachment',
      notepadId: selectedNotepad.id,
      attachmentId
    })
  }
  
  // Create from template
  const handleCreateFromTemplate = (templateId: string) => {
    const title = prompt('Enter a title for the new notepad:')
    if (!title) return
    
    vscode.postMessage({
      command: 'createFromTemplate',
      templateId,
      title
    })
    
    setShowTemplates(false)
  }
  
  // Generate content using AI
  const handleGenerateContent = () => {
    if (!aiPrompt) {
      showNotification('Please enter a prompt', 'error')
      return
    }
    
    vscode.postMessage({
      command: 'generateContent',
      prompt: aiPrompt
    })
  }
  
  // Analyze references in a notepad
  const handleAnalyzeReferences = () => {
    if (!selectedNotepad) return
    
    vscode.postMessage({
      command: 'analyzeReferences',
      notepadId: selectedNotepad.id
    })
  }
  
  // Suggest improvements for a notepad
  const handleSuggestImprovements = () => {
    if (!selectedNotepad) return
    
    vscode.postMessage({
      command: 'suggestImprovements',
      notepadId: selectedNotepad.id
    })
  }
  
  // Open a referenced file
  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({
      command: 'openFileInEditor',
      filePath
    })
  }
  
  // Show notification
  const showNotification = (text: string, type: 'info' | 'error' = 'info') => {
    if (!notificationsRef.current) return
    
    const notification = document.createElement('div')
    notification.className = `notification ${type}`
    notification.textContent = text
    
    notificationsRef.current.appendChild(notification)
    
    setTimeout(() => {
      notification.classList.add('fadeout')
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    }, 3000)
  }
  
  // Render operations status panel
  const renderOperationsStatus = () => {
    if (operations.length === 0 && !isProcessingBatch) return null
    
    return (
      <div className="operations-status">
        <h3>Operations</h3>
        
        {isProcessingBatch && (
          <div className="operation-item">
            <div className="operation-progress">
              <VSCodeProgressRing />
            </div>
            <div className="operation-details">
              <div className="operation-title">Processing batch operation</div>
            </div>
          </div>
        )}
        
        {operations.map(operation => (
          <div key={operation.id} className={`operation-item ${operation.status}`}>
            <div className="operation-progress">
              {operation.status === 'pending' ? (
                <VSCodeProgressRing />
              ) : operation.status === 'completed' ? (
                <span className="codicon codicon-check" />
              ) : (
                <span className="codicon codicon-error" />
              )}
            </div>
            
            <div className="operation-details">
              <div className="operation-title">
                Operation {operation.id.substring(0, 8)}
              </div>
              <div className="operation-message">
                {operation.message || `${operation.progress}% complete`}
              </div>
              
              {operation.status === 'pending' && (
                <VSCodeButton appearance="secondary" onClick={() => cancelOperation(operation.id)}>
                  Cancel
                </VSCodeButton>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }
  
  // Function to batch create notepads
  const handleBatchCreate = () => {
    const count = parseInt(prompt('How many notepads would you like to create?', '3') || '0')
    
    if (count > 0) {
      const operations = Array.from({ length: count }).map((_, i) => ({
        command: 'createNotepad',
        params: {
          title: `Batch Notepad ${i + 1}`,
          content: `This is an auto-generated notepad #${i + 1}`,
          tags: ['batch', 'auto-generated']
        }
      }))
      
      executeParallelOperation(operations)
    }
  }
  
  const renderSidebar = () => (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Notepads</h2>
        <div className="actions">
          <VSCodeButton onClick={() => {
            setIsCreating(true)
            setSelectedNotepad(null)
            setFormTitle('')
            setFormContent('')
            setFormTags([])
            setEditMode(false)
          }}>
            New Notepad
          </VSCodeButton>
          <VSCodeButton onClick={() => setShowTemplates(!showTemplates)}>
            Templates
          </VSCodeButton>
          <VSCodeButton onClick={handleBatchCreate}>
            Batch Operations
          </VSCodeButton>
        </div>
      </div>
      
      {showTemplates && (
        <TemplateList 
          templates={templates}
          onSelect={handleCreateFromTemplate}
        />
      )}
      
      <div className="notepad-list">
        {notepads.length === 0 ? (
          <div className="empty-state">
            <p>No notepads yet</p>
          </div>
        ) : (
          notepads.map(notepad => (
            <div 
              key={notepad.id} 
              className={`notepad-item ${selectedNotepad?.id === notepad.id ? 'selected' : ''}`}
              onClick={() => {
                vscode.postMessage({ command: 'getNotepad', notepadId: notepad.id })
                setIsCreating(false)
                setEditMode(false)
              }}
            >
              <h3 className="notepad-title">{notepad.title}</h3>
              <div className="notepad-meta">
                <span className="notepad-date">
                  {new Date(notepad.updatedAt).toLocaleDateString()}
                </span>
                <div className="notepad-tags">
                  {notepad.tags && notepad.tags.map(tag => (
                    <VSCodeTag key={tag}>{tag}</VSCodeTag>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
  
  const renderEditor = () => {
    if (isCreating) {
      return (
        <div className="editor">
          <div className="editor-header">
            <h2>New Notepad</h2>
            <div className="actions">
              <VSCodeButton onClick={() => setIsCreating(false)}>
                Cancel
              </VSCodeButton>
              <VSCodeButton onClick={handleCreateNotepad}>
                Save
              </VSCodeButton>
            </div>
          </div>
          
          <div className="editor-form">
            <VSCodeTextField
              value={formTitle}
              onChange={(e) => setFormTitle((e.target as HTMLInputElement).value)}
              placeholder="Title"
            />
            
            <TagInput 
              tags={formTags}
              onChange={setFormTags}
            />
            
            <VSCodeDivider />
            
            <div className="ai-prompt">
              <VSCodeTextField
                value={aiPrompt}
                onChange={(e) => setAiPrompt((e.target as HTMLInputElement).value)}
                placeholder="Ask AI to generate content..."
              />
              <VSCodeButton onClick={handleGenerateContent}>
                Generate
              </VSCodeButton>
            </div>
            
            <VSCodeTextArea
              value={formContent}
              onChange={(e) => setFormContent((e.target as HTMLTextAreaElement).value)}
              placeholder="Enter your content here..."
              rows={20}
            />
          </div>
        </div>
      )
    }
    
    if (!selectedNotepad) {
      return (
        <div className="editor empty-state">
          <p>Select a notepad or create a new one</p>
        </div>
      )
    }
    
    if (editMode) {
      return (
        <div className="editor">
          <div className="editor-header">
            <h2>Edit: {selectedNotepad.title}</h2>
            <div className="actions">
              <VSCodeButton onClick={() => setEditMode(false)}>
                Cancel
              </VSCodeButton>
              <VSCodeButton onClick={handleUpdateNotepad}>
                Save
              </VSCodeButton>
            </div>
          </div>
          
          <div className="editor-form">
            <VSCodeTextField
              value={formTitle}
              onChange={(e) => setFormTitle((e.target as HTMLInputElement).value)}
              placeholder="Title"
            />
            
            <TagInput 
              tags={formTags}
              onChange={setFormTags}
            />
            
            <VSCodeDivider />
            
            <div className="ai-prompt">
              <VSCodeTextField
                value={aiPrompt}
                onChange={(e) => setAiPrompt((e.target as HTMLInputElement).value)}
                placeholder="Ask AI to generate content..."
              />
              <VSCodeButton onClick={handleGenerateContent}>
                Generate
              </VSCodeButton>
            </div>
            
            <VSCodeTextArea
              value={formContent}
              onChange={(e) => setFormContent((e.target as HTMLTextAreaElement).value)}
              placeholder="Enter your content here..."
              rows={20}
            />
          </div>
        </div>
      )
    }
    
    return (
      <div className="editor">
        <div className="editor-header">
          <h2>{selectedNotepad.title}</h2>
          <div className="actions">
            <VSCodeButton onClick={() => {
              setFormTitle(selectedNotepad.title)
              setFormContent(selectedNotepad.content)
              setFormTags(selectedNotepad.tags || [])
              setEditMode(true)
            }}>
              Edit
            </VSCodeButton>
            <VSCodeButton onClick={handleDeleteNotepad}>
              Delete
            </VSCodeButton>
            <VSCodeButton onClick={handleAddAttachment}>
              Attach File
            </VSCodeButton>
          </div>
        </div>
        
        <div className="notepad-meta">
          <span className="notepad-date">
            Created: {new Date(selectedNotepad.createdAt).toLocaleDateString()}
            {' | '}
            Updated: {new Date(selectedNotepad.updatedAt).toLocaleDateString()}
          </span>
          <div className="notepad-tags">
            {selectedNotepad.tags && selectedNotepad.tags.map(tag => (
              <VSCodeTag key={tag}>{tag}</VSCodeTag>
            ))}
          </div>
        </div>
        
        <VSCodeDivider />
        
        <VSCodePanels>
          <VSCodePanelTab id="content">Content</VSCodePanelTab>
          <VSCodePanelTab id="attachments">
            Attachments ({selectedNotepad.attachments?.length || 0})
          </VSCodePanelTab>
          <VSCodePanelTab id="references">
            References ({selectedNotepad.references?.length || 0})
          </VSCodePanelTab>
          
          <VSCodePanelView id="content">
            <div className="content-view">
              <div className="ai-actions">
                <VSCodeButton onClick={handleSuggestImprovements}>
                  Suggest Improvements
                </VSCodeButton>
              </div>
              <div className="markdown-content">
                {/* In a real implementation, parse and render markdown */}
                <pre>{selectedNotepad.content}</pre>
              </div>
            </div>
          </VSCodePanelView>
          
          <VSCodePanelView id="attachments">
            <AttachmentList 
              attachments={selectedNotepad.attachments || []}
              onRemove={handleRemoveAttachment}
            />
          </VSCodePanelView>
          
          <VSCodePanelView id="references">
            <ReferencedFiles
              references={selectedNotepad.references || []}
              onRefresh={handleAnalyzeReferences}
            />
            
            {referencesAnalysis && (
              <div className="references-analysis">
                <h3>References Analysis</h3>
                <div className="reference-items">
                  {referencesAnalysis.referencedFiles.map((ref: any) => (
                    <div key={ref.path} className="reference-item">
                      <h4 onClick={() => handleOpenFile(ref.path)} className="file-path">
                        {ref.path}
                      </h4>
                      <p>{ref.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </VSCodePanelView>
        </VSCodePanels>
      </div>
    )
  }
  
  return (
    <div className="notepad-container">
      {renderSidebar()}
      {renderEditor()}
      {renderOperationsStatus()}
      <div className="notifications" ref={notificationsRef}></div>
    </div>
  )
}

// TagInput component
function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState<string>('')
  
  const handleAddTag = () => {
    if (!inputValue.trim()) return
    
    const newTags = [...tags, inputValue.trim()]
    onChange(newTags)
    setInputValue('')
  }
  
  const handleRemoveTag = (index: number) => {
    const newTags = [...tags]
    newTags.splice(index, 1)
    onChange(newTags)
  }
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }
  
  return (
    <div className="tag-input">
      <label>Tags</label>
      <div className="tag-input-field">
        <VSCodeTextField
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag..."
        />
        <VSCodeButton onClick={handleAddTag}>Add</VSCodeButton>
      </div>
      <div className="tag-list">
        {tags.map((tag, index) => (
          <div key={index} className="tag-item">
            <VSCodeTag>
              {tag}
              <button 
                className="tag-remove" 
                onClick={() => handleRemoveTag(index)}
              >
                ×
              </button>
            </VSCodeTag>
          </div>
        ))}
      </div>
    </div>
  )
}

// AttachmentList component
function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) {
    return (
      <div className="empty-state">
        <p>No attachments</p>
      </div>
    )
  }
  
  return (
    <div className="attachment-list">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="attachment-item">
          <div className="attachment-info">
            <span className="attachment-icon">
              {/* Display icon based on file type */}
              📎
            </span>
            <span className="attachment-name">
              {attachment.name}
            </span>
            <span className="attachment-size">
              {formatFileSize(attachment.size)}
            </span>
          </div>
          <div className="attachment-actions">
            <VSCodeButton appearance="icon" onClick={() => onRemove(attachment.id)}>
              🗑️
            </VSCodeButton>
          </div>
        </div>
      ))}
    </div>
  )
}

// ReferencedFiles component
function ReferencedFiles({ references, onRefresh }: ReferencedFilesProps) {
  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({
      command: 'openFileInEditor',
      filePath
    })
  }
  
  if (references.length === 0) {
    return (
      <div className="empty-state">
        <p>No file references found</p>
        <p className="hint">Use @file syntax to reference files in your notepad content</p>
      </div>
    )
  }
  
  return (
    <div className="references-list">
      <div className="references-header">
        <h3>Referenced Files</h3>
        <VSCodeButton onClick={onRefresh}>
          Analyze References
        </VSCodeButton>
      </div>
      
      <div className="reference-items">
        {references.map((filePath) => (
          <div key={filePath} className="reference-item">
            <span onClick={() => handleOpenFile(filePath)} className="file-path">
              {filePath}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// TemplateList component
function TemplateList({ templates, onSelect }: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <div className="empty-state">
        <p>No templates available</p>
      </div>
    )
  }
  
  return (
    <div className="template-list">
      <h3>Templates</h3>
      
      <div className="template-items">
        {templates.map((template) => (
          <div key={template.id} className="template-item">
            <div className="template-info">
              <h4>{template.title}</h4>
              <div className="template-tags">
                {template.tags && template.tags.map(tag => (
                  <VSCodeTag key={tag}>{tag}</VSCodeTag>
                ))}
              </div>
            </div>
            <VSCodeButton onClick={() => onSelect(template.id)}>
              Use
            </VSCodeButton>
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

export default NotepadView 