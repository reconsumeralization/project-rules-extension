import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

// VS Code API for webview communication
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (msg: any) => void
      setState: (state: any) => void
      getState: () => any
    }
  }
}

// Get VS Code API
const vscode = window.acquireVsCodeApi()

// Type definitions for data from the extension
interface Rule {
  id: string
  title: string
  filename: string
  content: string
  syncStatus: 'synced' | 'local-only' | 'server-only' | 'conflict'
  appliesTo?: string
}

// Main component
export function RulesViewApp() {
  const [rules, setRules] = useState<Rule[]>([])
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  
  // Listen for messages from the extension
  useEffect(() => {
    const messageListener = (event: MessageEvent) => {
      const message = event.data
      
      switch (message.type) {
        case 'updateRules':
          setRules(message.rules)
          break
        case 'selectRule':
          setSelectedRule(message.rule)
          break
        case 'showCreateDialog':
          setIsCreateDialogOpen(true)
          break
      }
    }
    
    window.addEventListener('message', messageListener)
    
    // Request initial rules data
    vscode.postMessage({ type: 'getRules' })
    
    return () => window.removeEventListener('message', messageListener)
  }, [])
  
  // Handlers
  const handleCreateRule = (ruleData: { title: string, content: string }) => {
    vscode.postMessage({
      type: 'createRule',
      rule: ruleData
    })
    setIsCreateDialogOpen(false)
  }
  
  const handleDeleteRule = (ruleId: string) => {
    vscode.postMessage({
      type: 'deleteRule',
      ruleId
    })
  }
  
  const handleEditRule = (ruleId: string) => {
    vscode.postMessage({
      type: 'openRule',
      ruleId
    })
  }
  
  // Render UI using Radix components
  return (
    <div className="container">
      <header className="header">
        <h2>Project Rules</h2>
        <div className="actions">
          <button 
            className="button-primary"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            Add Rule
          </button>
        </div>
      </header>
      
      <div className="rules-list">
        {rules.length === 0 ? (
          <div className="empty-state">
            No rules defined yet. Click "Add Rule" to create one.
          </div>
        ) : (
          rules.map(rule => (
            <div key={rule.id} className="rule-item">
              <div className="rule-details">
                <div className="rule-header">
                  <span className="rule-title">{rule.title}</span>
                  <span className="rule-filename">{rule.filename}</span>
                </div>
                <div className="rule-meta">
                  {rule.appliesTo && (
                    <span className="rule-applies-to">
                      {rule.appliesTo}
                    </span>
                  )}
                  <span className={`rule-sync-status ${rule.syncStatus}`}>
                    {rule.syncStatus}
                  </span>
                </div>
              </div>
              <div className="rule-actions">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="icon-button" aria-label="More options">
                      ⋯
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content className="dropdown-content">
                    <DropdownMenu.Item 
                      className="dropdown-item"
                      onSelect={() => handleEditRule(rule.id)}
                    >
                      Edit
                    </DropdownMenu.Item>
                    <DropdownMenu.Item 
                      className="dropdown-item"
                      onSelect={() => handleDeleteRule(rule.id)}
                    >
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Create Rule Dialog */}
      <Dialog.Root open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">Create New Rule</Dialog.Title>
            <CreateRuleForm onSubmit={handleCreateRule} />
            <Dialog.Close asChild>
              <button className="button-secondary">Cancel</button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

// Form component for creating rules
function CreateRuleForm({ onSubmit }: { onSubmit: (data: { title: string, content: string }) => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ title, content })
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="rule-title">Title:</label>
        <input
          id="rule-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="rule-content">Content:</label>
        <textarea
          id="rule-content"
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={10}
          required
        />
      </div>
      
      <div className="form-actions">
        <button type="submit" className="button-primary">
          Create Rule
        </button>
      </div>
    </form>
  )
} 