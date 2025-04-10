// MCPServerAgents.js - Functionality for MCPServerAgents.html
(function() {
  // State management
  const state = {
    agents: [],
    selectedAgent: null,
    filters: {
      type: 'all',
      status: 'all'
    }
  };

  // DOM elements
  const elements = {
    agentList: document.getElementById('agent-list'),
    agentDetails: document.getElementById('agent-details'),
    filterTypeSelect: document.getElementById('filter-type'),
    filterStatusSelect: document.getElementById('filter-status'),
    searchInput: document.getElementById('search-agents'),
    createAgentBtn: document.getElementById('create-agent'),
    refreshBtn: document.getElementById('refresh-agents'),
    refreshAllStatsBtn: document.getElementById('refresh-all-stats')
  };

  // VSCode API connection
  const vscode = acquireVsCodeApi();

  // Initialize the view
  function initView() {
    registerEventListeners();
    requestAgentData();
  }

  // Register all event listeners
  function registerEventListeners() {
    // Filter change events
    if (elements.filterTypeSelect) {
      elements.filterTypeSelect.addEventListener('change', () => {
        state.filters.type = elements.filterTypeSelect.value;
        renderAgentList();
      });
    }

    if (elements.filterStatusSelect) {
      elements.filterStatusSelect.addEventListener('change', () => {
        state.filters.status = elements.filterStatusSelect.value;
        renderAgentList();
      });
    }

    // Search input
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', () => {
        renderAgentList();
      });
    }

    // Create agent button
    if (elements.createAgentBtn) {
      elements.createAgentBtn.addEventListener('click', () => {
        vscode.postMessage({
          command: 'createAgent'
        });
      });
    }

    // Refresh button
    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener('click', () => {
        requestAgentData(true);
      });
    }

    // Refresh All Stats button
    if (elements.refreshAllStatsBtn) {
      elements.refreshAllStatsBtn.addEventListener('click', () => {
        elements.refreshAllStatsBtn.disabled = true;
        elements.refreshAllStatsBtn.textContent = 'Refreshing All...';
        
        vscode.postMessage({
          command: 'executeCommand',
          commandId: 'ProjectRules.refreshAllAgentStats'
        });

        setTimeout(() => {
          if (elements.refreshAllStatsBtn) {
            elements.refreshAllStatsBtn.disabled = false;
            elements.refreshAllStatsBtn.textContent = 'Refresh All Stats';
          }
        }, 5000);
      });
    }

    // Agent list delegation for buttons (including new refresh stats button)
    if (elements.agentList) {
      elements.agentList.addEventListener('click', event => {
        const target = event.target;
        if (!target || !(target instanceof HTMLElement)) return;
        
        // Handle refresh stats button
        if (target.classList.contains('refresh-stats-button')) {
          const agentCard = target.closest('.agent-card');
          if (agentCard && agentCard.dataset.id) {
            // Visual feedback
            target.textContent = 'Refreshing...';
            target.disabled = true;
            
            // Send message to extension
            vscode.postMessage({
              command: 'refreshAgentStats',
              agentId: agentCard.dataset.id
            });
          }
          return;
        }
        
        // Handle view details button
        if (target.classList.contains('view-details')) {
          const agentCard = target.closest('.agent-card');
          if (agentCard && agentCard.dataset.id) {
            selectAgent(agentCard.dataset.id);
          }
        }
      });
    }
    
    // Handle clicks in the agent details section (for refresh stats)
    if (elements.agentDetails) {
      elements.agentDetails.addEventListener('click', event => {
        const target = event.target;
        if (!target || !(target instanceof HTMLElement)) return;
        
        if (target.classList.contains('refresh-stats-button')) {
          if (state.selectedAgent && state.selectedAgent.id) {
            // Visual feedback
            target.textContent = 'Refreshing...';
            target.disabled = true;
            
            // Send message to extension
            vscode.postMessage({
              command: 'refreshAgentStats',
              agentId: state.selectedAgent.id
            });
          }
        }
        
        // Other existing details buttons handlers...
        if (target.id === 'toggle-agent' && state.selectedAgent) {
          vscode.postMessage({
            command: 'toggleAgentStatus',
            agentId: state.selectedAgent.id,
            currentStatus: state.selectedAgent.status
          });
        }
        
        if (target.id === 'edit-agent' && state.selectedAgent) {
          vscode.postMessage({
            command: 'editAgent',
            agentId: state.selectedAgent.id
          });
        }
        
        if (target.id === 'delete-agent' && state.selectedAgent) {
          if (confirm(`Are you sure you want to delete the agent "${state.selectedAgent.name}"?`)) {
            vscode.postMessage({
              command: 'deleteAgent',
              agentId: state.selectedAgent.id
            });
          }
        }
      });
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'agentList':
          state.agents = message.data;
          renderAgentList();
          if (state.selectedAgent) {
            const updatedSelected = state.agents.find(a => a.id === state.selectedAgent.id);
            if (updatedSelected) {
              state.selectedAgent = updatedSelected;
              renderAgentDetails();
            }
          }
          break;
        case 'agentDetails':
          state.selectedAgent = message.data;
          renderAgentDetails();
          break;
        case 'notification':
          showNotification(message.text, message.type);
          if (elements.refreshAllStatsBtn) {
            elements.refreshAllStatsBtn.disabled = false;
            elements.refreshAllStatsBtn.textContent = 'Refresh All Stats';
          }
          if (message.text.includes('Deleted agent')) {
            requestAgentData();
          }
          break;
      }
    });
  }

  // Request agent data from the extension
  function requestAgentData(forceServerFetch = false) {
    vscode.postMessage({
      command: 'getAgents',
      forceServer: forceServerFetch
    });

    // Show loading state
    if (elements.agentList) {
      elements.agentList.innerHTML = '<div class="loading">Loading agents...</div>';
    }
  }

  // Render the agent list with current filters
  function renderAgentList() {
    if (!elements.agentList) return;
    
    const searchTerm = elements.searchInput ? elements.searchInput.value.toLowerCase() : '';
    
    // Filter agents
    const filteredAgents = state.agents.filter(agent => {
      // Type filter
      if (state.filters.type !== 'all' && agent.type !== state.filters.type) {
        return false;
      }
      
      // Status filter
      if (state.filters.status !== 'all' && agent.status !== state.filters.status) {
        return false;
      }
      
      // Search filter
      if (searchTerm && !agent.name.toLowerCase().includes(searchTerm) && 
          !agent.description.toLowerCase().includes(searchTerm)) {
        return false;
      }
      
      return true;
    });
    
    // Clear list
    elements.agentList.innerHTML = '';
    
    // If no agents after filtering
    if (filteredAgents.length === 0) {
      elements.agentList.innerHTML = '<div class="no-results">No agents match your filters</div>';
      return;
    }
    
    // Create agent card for each agent
    filteredAgents.forEach(agent => {
      const agentCard = document.createElement('div');
      agentCard.className = 'agent-card';
      agentCard.dataset.id = agent.id;
      
      const statusClass = agent.status === 'active' ? 'status-active' : 
                          agent.status === 'inactive' ? 'status-inactive' : 'status-pending';
      
      agentCard.innerHTML = `
        <div class="agent-header">
          <h3>${agent.name}</h3>
          <span class="agent-type">${agent.type}</span>
        </div>
        <p>${agent.description}</p>
        ${renderAgentStatsSummary(agent.stats)}
        <div class="agent-footer">
          <span class="agent-status ${statusClass}">${agent.status}</span>
          <div class="agent-actions">
            <button class="view-details">View Details</button>
            <button class="refresh-stats-button">Refresh Stats</button>
          </div>
        </div>
      `;
      
      elements.agentList.appendChild(agentCard);
    });
  }
  
  // Render a summary of agent stats for the list view
  function renderAgentStatsSummary(stats) {
    if (!stats) return '<div class="agent-stats-summary"><em>No stats available</em></div>';
    
    // Format stats for display
    const tasksCompleted = stats.tasksCompleted !== undefined ? stats.tasksCompleted : 'N/A';
    const successRate = stats.successRate !== undefined ? 
      `${(stats.successRate * 100).toFixed(1)}%` : 'N/A';
    
    return `
      <div class="agent-stats-summary">
        <div class="stat-row">
          <span class="stat-label">Tasks:</span>
          <span class="stat-value">${tasksCompleted}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Success:</span>
          <span class="stat-value">${successRate}</span>
        </div>
      </div>
    `;
  }

  // Select an agent and request its details
  function selectAgent(agentId) {
    vscode.postMessage({
      command: 'getAgentDetails',
      agentId: agentId
    });
    
    // Update selected state in UI
    const agentCards = document.querySelectorAll('.agent-card');
    agentCards.forEach(card => {
      if (card.dataset.id === agentId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  // Render the details of the selected agent
  function renderAgentDetails() {
    if (!elements.agentDetails || !state.selectedAgent) return;
    
    elements.agentDetails.innerHTML = `
      <div class="agent-detail-header">
        <h2>${state.selectedAgent.name}</h2>
        <div class="agent-controls">
          <button id="toggle-agent" class="${state.selectedAgent.status === 'active' ? 'deactivate' : 'activate'}">
            ${state.selectedAgent.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
          <button id="edit-agent">Edit</button>
          <button id="delete-agent">Delete</button>
        </div>
      </div>
      
      <div class="agent-info">
        <div class="info-row">
          <span class="label">Type:</span>
          <span class="value">${state.selectedAgent.type}</span>
        </div>
        <div class="info-row">
          <span class="label">Status:</span>
          <span class="value status-${state.selectedAgent.status}">${state.selectedAgent.status}</span>
        </div>
        <div class="info-row">
          <span class="label">Created:</span>
          <span class="value">${state.selectedAgent.createdAt ? new Date(state.selectedAgent.createdAt).toLocaleString() : 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="label">Last Active:</span>
          <span class="value">${state.selectedAgent.lastActive ? new Date(state.selectedAgent.lastActive).toLocaleString() : 'Never'}</span>
        </div>
      </div>
      
      <div class="agent-description">
        <h3>Description</h3>
        <p>${state.selectedAgent.description}</p>
      </div>
      
      <div class="agent-capabilities">
        <h3>Capabilities</h3>
        <ul>
          ${state.selectedAgent.capabilities ? state.selectedAgent.capabilities.map(capability => `<li>${capability}</li>`).join('') : '<li>No capabilities defined</li>'}
        </ul>
      </div>
      
      <div class="agent-configuration">
        <h3>Configuration</h3>
        <pre><code>${JSON.stringify(state.selectedAgent.configuration || {}, null, 2)}</code></pre>
      </div>
      
      <div class="agent-stats">
        <div class="stats-header">
          <h3>Statistics</h3>
          <button class="refresh-stats-button">Refresh Stats</button>
        </div>
        ${renderAgentStatsDetailed(state.selectedAgent.stats)}
      </div>
    `;
  }
  
  // Render detailed stats for the details view
  function renderAgentStatsDetailed(stats) {
    if (!stats) return '<div class="stats-empty">No statistics available for this agent.</div>';
    
    // Format values for display
    const tasksCompleted = stats.tasksCompleted !== undefined ? stats.tasksCompleted : 'N/A';
    const successRate = stats.successRate !== undefined ? 
      `${(stats.successRate * 100).toFixed(1)}%` : 'N/A';
    const avgRuntime = stats.averageRuntime !== undefined ? 
      `${(stats.averageRuntime / 1000).toFixed(2)}s` : 'N/A';
    const tokenUsage = stats.tokenUsage !== undefined ? 
      stats.tokenUsage.toLocaleString() : 'N/A';
    
    return `
      <div class="stats-grid">
        <div class="stat-box">
          <span class="stat-value">${tasksCompleted}</span>
          <span class="stat-label">Tasks Completed</span>
        </div>
        <div class="stat-box">
          <span class="stat-value">${successRate}</span>
          <span class="stat-label">Success Rate</span>
        </div>
        <div class="stat-box">
          <span class="stat-value">${avgRuntime}</span>
          <span class="stat-label">Avg. Runtime</span>
        </div>
        <div class="stat-box">
          <span class="stat-value">${tokenUsage}</span>
          <span class="stat-label">Token Usage</span>
        </div>
      </div>
    `;
  }

  // Show notification message
  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-notification';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(notification);
    });
    
    notification.appendChild(closeBtn);
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 5000);
  }

  // Initialize on load
  document.addEventListener('DOMContentLoaded', initView);
})(); 