(function () {
  // Get VS Code API (acquireVsCodeApi returns a singleton that can only be called once)
  const vscode = acquireVsCodeApi()

  // DOM elements
  const createRuleButton = document.getElementById('createRuleButton')
  const syncButton = document.getElementById('syncButton')
  const rulesListContainer = document.getElementById('rulesList')

  // Enable the sync button
  if (syncButton) {
      syncButton.disabled = false;
  }

  // --- Utility Functions ---
  function escapeHtml(unsafe) {
    if (!unsafe) return '' // Handle null/undefined input
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function getSyncStatusClass(status) {
    switch (status) {
      case 'synced':
        return 'sync-status-synced'
      case 'local-only':
        return 'sync-status-local'
      case 'server-only':
        return 'sync-status-server'
      case 'conflict':
        return 'sync-status-conflict'
      default:
        return ''
    }
  }

  function getSyncStatusTitle(status) {
    switch (status) {
      case 'synced':
        return 'Synced with server'
      case 'local-only':
        return 'Local only - unsynced changes' // Updated text
      case 'server-only':
        return 'Downloaded from server - not yet saved locally (or workspace not open)' // Updated text
      case 'conflict':
        return 'Conflict detected - needs resolution'
      default:
        return 'Unknown sync status'
    }
  }

  // --- Event Listeners ---
  createRuleButton.addEventListener('click', () => {
    vscode.postMessage({ command: 'createRule' })
  })

  // Sync button listener (already present, ensure button is enabled above)
  syncButton.addEventListener('click', () => {
    vscode.postMessage({ command: 'syncRules' })
  })

  // Delegate event listeners for edit/delete buttons
  rulesListContainer.addEventListener('click', (event) => {
    const target = event.target
    const ruleItem = target.closest('.rule-item')
    if (!ruleItem) return

    const ruleId = ruleItem.dataset.ruleId
    if (!ruleId) return // Added safety check

    if (target.closest('.edit-button')) {
      vscode.postMessage({ command: 'editRule', ruleId: ruleId })
    } else if (target.closest('.delete-button')) {
      vscode.postMessage({ command: 'deleteRule', ruleId: ruleId })
    }
  })

  // Handle messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data // The JSON data that the extension sent
    console.log('Webview received message:', message)

    switch (message.command) {
      case 'updateRules':
        updateRulesList(message.rules)
        break
    }
  })

  // --- UI Update Function ---
  function updateRulesList(rules) {
    // Clear existing content
    rulesListContainer.innerHTML = ''

    if (!rules || rules.length === 0) {
      rulesListContainer.innerHTML =
        '<div class="empty-state">No rules defined yet. Click "Add New Rule" to create one.</div>'
      return
    }

    // Create and append rule items
    rules.forEach((rule) => {
      const ruleItem = document.createElement('div')
      ruleItem.className = 'rule-item'
      ruleItem.dataset.ruleId = rule.id // Store ID for event listeners

      const syncStatusClass = getSyncStatusClass(rule.syncStatus)
      const syncStatusTitle = getSyncStatusTitle(rule.syncStatus)

      ruleItem.innerHTML = /*html*/ `
                <div class="rule-details">
                    <div class="rule-header">
                        <span class="rule-title">${escapeHtml(rule.description)}</span>
                        <span class="rule-filename" title="${escapeHtml(rule.filename)}">${escapeHtml(rule.filename)}</span>
                    </div>
                    <div class="rule-meta">
                         ${rule.appliesTo && rule.appliesTo !== 'N/A' ? `<span class="rule-applies-to" title="Applies To: ${escapeHtml(rule.appliesTo)}"><i class="codicon codicon-tag"></i> ${escapeHtml(rule.appliesTo)}</span>` : ''}
                        <span class="rule-sync-indicator ${syncStatusClass}" title="${escapeHtml(syncStatusTitle)}"></span>
                    </div>
                </div>
                <div class="rule-actions">
                    <button class="action-button edit-button" title="Edit Rule">
                        <i class="codicon codicon-edit"></i>
                    </button>
                    <button class="action-button delete-button" title="Delete Rule">
                        <i class="codicon codicon-trash"></i>
                    </button>
                </div>
            `
      rulesListContainer.appendChild(ruleItem)
    })
  }

   // --- Initial Request ---
   // Request rules when the view loads
   console.log('Webview requesting initial rule update.')
   vscode.postMessage({ command: 'requestRuleUpdate' });

})() 