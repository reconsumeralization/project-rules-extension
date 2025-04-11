// Get the VS Code API
const vscode = acquireVsCodeApi();

// Task model structure
/*
{
  id: string,
  title: string,
  description: string,
  status: 'pending' | 'in-progress' | 'completed',
  priority: 'high' | 'medium' | 'low',
  assignee: string,
  dueDate: string, // ISO date string
  relatedRuleId: string,
  createdAt: string, // ISO date string
  updatedAt: string, // ISO date string
  metadata: {
    id: string,
    title: string,
    description: string,
    complexity: number, // 1-5 scale
    assignedTo: string,
    dueDate: number, // timestamp
    aiGenerated: boolean,
    lastError: string, // last error message if task is blocked
    // other metadata as needed
  }
}
*/

// State management
let state = {
    tasks: [],
    rules: [],
    users: [],
    filters: {
        search: '',
        status: 'all',
        priority: 'all',
        assignee: 'all',
        ruleLink: 'all',
        sort: 'updatedAt-desc'
    },
    currentTask: null,
    selectedRuleIdForGeneration: null // Track selected rule for generation button
};

// DOM elements
const elements = {
    tasksContainer: document.getElementById('tasksContainer'),
    modalTitle: document.getElementById('modalTitle'),
    form: document.getElementById('taskForm'),
    deleteBtn: document.getElementById('deleteTaskBtn'),
    searchInput: document.getElementById('searchInput'),
    statusFilter: document.getElementById('statusFilter'),
    priorityFilter: document.getElementById('priorityFilter'),
    assigneeFilter: document.getElementById('assigneeFilter'),
    ruleLinkFilter: document.getElementById('ruleLinkFilter'),
    sortBy: document.getElementById('sortBy'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    emptyStateAddBtn: document.getElementById('emptyStateAddBtn'),
    generateTasksBtn: document.getElementById('generateTasksForRuleBtn') // New button
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize listeners
    initEventListeners();
    
    // Request initial data
    vscode.postMessage({
        command: 'getTasks'
    });
    
    vscode.postMessage({
        command: 'getRules'
    });
    
    vscode.postMessage({
        command: 'getUsers'
    });
    
    // Call initial button state update after elements exist
    updateGenerateTasksButtonState();
});

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'tasksLoaded':
            state.tasks = message.tasks;
            renderTasks();
            break;
            
        case 'rulesLoaded':
            state.rules = message.rules;
            populateRulesDropdown();
            break;
            
        case 'usersLoaded':
            state.users = message.users;
            populateAssigneesDropdown();
            break;
            
        case 'taskCreated':
        case 'taskUpdated':
            // Refresh task list
            vscode.postMessage({
                command: 'getTasks'
            });
            closeTaskModal();
            break;
            
        case 'taskDeleted':
            // Refresh task list
            vscode.postMessage({
                command: 'getTasks'
            });
            closeDeleteModal();
            break;
            
        case 'error':
            // Show error notification
            showNotification(message.message, 'error');
            break;
    }
});

// Initialize event listeners
function initEventListeners() {
    // Add task button
    elements.addTaskBtn.addEventListener('click', () => {
        showTaskModal();
    });
    
    // Empty state add button
    elements.emptyStateAddBtn?.addEventListener('click', () => {
        showTaskModal();
    });
    
    // Close modal buttons
    document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
    document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
    document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    
    // Save task button
    elements.form.addEventListener('click', saveTask);
    
    // Delete task buttons
    elements.deleteBtn.addEventListener('click', showDeleteConfirmation);
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteTask);
    
    // Filter changes
    elements.searchInput.addEventListener('input', handleFilterChange);
    elements.statusFilter.addEventListener('change', handleFilterChange);
    elements.priorityFilter.addEventListener('change', handleFilterChange);
    elements.assigneeFilter.addEventListener('change', handleFilterChange);
    elements.ruleLinkFilter.addEventListener('change', handleFilterChange);
    elements.sortBy.addEventListener('change', handleFilterChange);
    
    // Handle click events through delegation
    elements.tasksContainer.addEventListener('click', handleTaskContainerClick);
    
    // Add listener for the new Generate Tasks button
    if (elements.generateTasksBtn) {
        elements.generateTasksBtn.addEventListener('click', () => {
            if (elements.generateTasksBtn.disabled || !state.selectedRuleIdForGeneration) {
                return; // Should not be clickable if disabled, but double-check
            }
            
            vscode.postMessage({
                command: 'executeCommand',
                commandId: 'ProjectRules.generateTasksForRule',
                args: [state.selectedRuleIdForGeneration] // Pass selected rule ID as argument
            });
            
            // Optionally provide feedback
            elements.generateTasksBtn.textContent = 'Generating...';
            setTimeout(() => { // Reset after a bit
                if(elements.generateTasksBtn) {
                    elements.generateTasksBtn.textContent = '$(sparkle) Generate Tasks';
                }
            }, 2000);
        });
    }
}

// Handle clicks within the task container using delegation
function handleTaskContainerClick(event) {
    const target = event.target.closest('button.task-action-btn');
    if (!target) {return}

    const taskCard = target.closest('.task-card');
    const taskId = taskCard?.dataset.id;
    if (!taskId) {return}

    // Edit task button
    if (target.classList.contains('edit-task-btn')) {
        const task = state.tasks.find(t => t.metadata.id === taskId);
        if (task) {
            showTaskModal(task);
        }
        return;
    }
    
    // Go to Rule button
    if (target.classList.contains('goto-rule-btn')) {
        const ruleId = taskCard.dataset.ruleId;
        if (ruleId) {
            console.log('Attempting to navigate to rule:', ruleId);
            vscode.postMessage({
                command: 'executeCommand',
                commandId: 'ProjectRules.editRule', 
                args: [ruleId]
            });
        }
        return;
    }

    // --- Assign to Me button ---
    if (target.classList.contains('assign-me-btn')) {
        console.log('Assigning task to me:', taskId); 
        vscode.postMessage({
            command: 'executeCommand',
            commandId: 'ProjectRules.assignTaskToMe',
            args: [taskId] // Pass taskId as argument
        });
        target.disabled = true;
        setTimeout(() => { target.disabled = false; }, 1500);
        return;
    }

    // --- Estimate Complexity button ---
    if (target.classList.contains('estimate-complexity-btn')) {
        console.log('Estimating complexity for task:', taskId); 
        vscode.postMessage({
            command: 'executeCommand',
            commandId: 'ProjectRules.estimateTaskComplexity',
            args: [taskId] // Pass taskId as argument
        });
        target.disabled = true;
        target.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Estimating...'; 
        // Reset button state after a delay 
        setTimeout(() => { 
            target.disabled = false; 
            target.innerHTML = '<span class="codicon codicon-symbol-numeric"></span> Estimate'; 
        }, 3000); 
        return;
    }
}

// Handle filter changes and update UI state
function handleFilterChange() {
    const selectedRule = elements.ruleLinkFilter.value;
    state.filters = {
        search: elements.searchInput.value.toLowerCase(),
        status: elements.statusFilter.value,
        priority: elements.priorityFilter.value,
        assignee: elements.assigneeFilter.value,
        ruleLink: selectedRule,
        sort: elements.sortBy.value
    };
    
    // Update state for generation button
    state.selectedRuleIdForGeneration = (selectedRule !== 'all') ? selectedRule : null;
    updateGenerateTasksButtonState();
    
    renderTasks(); // Re-render the task list based on new filters
}

// Update the enabled/disabled state of the Generate Tasks button
function updateGenerateTasksButtonState() {
    if (elements.generateTasksBtn) {
        elements.generateTasksBtn.disabled = !state.selectedRuleIdForGeneration;
        // Update tooltip maybe?
        if (state.selectedRuleIdForGeneration) {
            const selectedRuleName = state.rules.find(r => r.id === state.selectedRuleIdForGeneration)?.title || 'selected rule';
            elements.generateTasksBtn.title = `Generate tasks for rule: ${selectedRuleName}`;
        } else {
            elements.generateTasksBtn.title = 'Select a specific rule in the filter to enable task generation';
        }
    }
}

// Show task creation/edit modal
function showTaskModal(task = null) {
    state.currentTask = task;
    const modalTitle = elements.modalTitle;
    const form = elements.form;
    const deleteBtn = elements.deleteBtn;
    
    // Reset form
    form.reset();
    
    if (task) {
        // Edit mode
        modalTitle.textContent = 'Edit Task';
        document.getElementById('taskId').value = task.metadata.id;
        document.getElementById('title').value = task.metadata.title;
        document.getElementById('description').value = task.metadata.description || '';
        document.getElementById('status').value = task.status;
        document.getElementById('priority').value = task.priority;
        document.getElementById('assignee').value = task.metadata.assignedTo || '';
        document.getElementById('dueDate').value = task.metadata.dueDate ? new Date(task.metadata.dueDate).toISOString().split('T')[0] : '';
        document.getElementById('relatedRuleId').value = task.ruleId || '';
        
        // Show delete button in edit mode
        deleteBtn.style.display = 'block';
    } else {
        // Create mode
        modalTitle.textContent = 'New Task';
        document.getElementById('taskId').value = '';
        document.getElementById('status').value = 'pending';
        document.getElementById('priority').value = 'medium';
        
        // Hide delete button in create mode
        deleteBtn.style.display = 'none';
    }
    
    document.getElementById('taskModal').classList.add('show');
}

// Close task modal
function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('show');
    state.currentTask = null;
}

// Show delete confirmation modal
function showDeleteConfirmation() {
    closeTaskModal();
    document.getElementById('deleteModal').classList.add('show');
}

// Close delete confirmation modal
function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
}

// Save task
function saveTask() {
    const form = elements.form;
    
    // Basic validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const taskId = document.getElementById('taskId').value;
    const task = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        status: document.getElementById('status').value,
        priority: document.getElementById('priority').value,
        assignee: document.getElementById('assignee').value,
        dueDate: document.getElementById('dueDate').value,
        relatedRuleId: document.getElementById('relatedRuleId').value || null
    };
    
    if (taskId) {
        // Update existing task
        vscode.postMessage({
            command: 'updateTask',
            taskId: taskId,
            task: task
        });
    } else {
        // Create new task
        vscode.postMessage({
            command: 'createTask',
            task: task
        });
    }
}

// Delete task
function deleteTask() {
    if (!state.currentTask) {
        return;
    }
    
    vscode.postMessage({
        command: 'deleteTask',
        taskId: state.currentTask.metadata.id
    });
}

// Populate rules dropdown
function populateRulesDropdown() {
    const ruleDropdowns = [
        document.getElementById('relatedRuleId'),
        document.getElementById('ruleLinkFilter')
    ];
    
    ruleDropdowns.forEach(dropdown => {
        // Skip if dropdown not found
        if (!dropdown) {
            return;
        }
        
        // Save current selection
        const currentValue = dropdown.value;
        
        // Keep only the first option
        const defaultOption = dropdown.querySelector('option:first-child');
        dropdown.innerHTML = '';
        dropdown.appendChild(defaultOption);
        
        // Add rules as options
        state.rules.forEach(rule => {
            const option = document.createElement('option');
            option.value = rule.id;
            option.textContent = rule.title || rule.id;
            dropdown.appendChild(option);
        });
        
        // Restore selection if possible
        if (currentValue) {
            dropdown.value = currentValue;
        }
    });
    
    // Update button state after populating
    updateGenerateTasksButtonState();
}

// Populate assignees dropdown
function populateAssigneesDropdown() {
    const dropdown = document.getElementById('assigneeFilter');
    
    // Skip if dropdown not found
    if (!dropdown) {
        return;
    }
    
    // Save current selection
    const currentValue = dropdown.value;
    
    // Keep only the first two options (All and Unassigned)
    const defaultOptions = Array.from(dropdown.querySelectorAll('option')).slice(0, 2);
    dropdown.innerHTML = '';
    defaultOptions.forEach(option => dropdown.appendChild(option));
    
    // Add users as options
    state.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name || user.id;
        option.textContent = user.name || user.id;
        dropdown.appendChild(option);
    });
    
    // Restore selection if possible
    if (currentValue) {
        dropdown.value = currentValue;
    }
}

// Render tasks based on current filters
function renderTasks() {
    const container = elements.tasksContainer;
    container.innerHTML = '';
    
    // Apply filters and sorting
    const filteredAndSortedTasks = getFilteredAndSortedTasks();
    
    // Show empty state if no tasks match filters
    if (filteredAndSortedTasks.length === 0) {
        const template = document.getElementById('emptyStateTemplate');
        if (template) {
            const emptyState = template.content.cloneNode(true);
            container.appendChild(emptyState);
            // Re-attach listener for empty state button if needed
            const emptyBtn = container.querySelector('#emptyStateAddBtn');
            emptyBtn?.addEventListener('click', () => showTaskModal());
        } else {
            container.innerHTML = '<p class="empty-state">No tasks match your filters.</p>';
        }
        return;
    }
    
    // Render each task
    filteredAndSortedTasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = `task-card status-${task.status} priority-${task.priority}`;
        taskCard.dataset.id = task.metadata.id;
        if (task.ruleId) {
            taskCard.dataset.ruleId = task.ruleId;
        }
        
        // Use metadata properties
        const aiIndicator = task.metadata.aiGenerated ? '<span class="task-ai-indicator codicon codicon-sparkle" title="AI Generated"></span>' : '';
        const lastError = task.metadata.lastError;
        const errorInfo = lastError ? `Status: ${task.status}\nError: ${lastError}` : `Status: ${task.status}`;
        const errorIcon = lastError ? '<span class="codicon codicon-error task-error-icon"></span>' : '';
        const complexity = task.metadata.complexity;
        const assignee = task.metadata.assignedTo;
        const description = task.metadata.description;
        const dueDateTimestamp = task.metadata.dueDate;
        const formattedDueDate = dueDateTimestamp ? new Date(dueDateTimestamp).toLocaleDateString() : '';
        
        // Look up related rule title
        const relatedRule = task.ruleId ? state.rules.find(r => r.id === task.ruleId) : null;
        const relatedRuleTitle = relatedRule ? (relatedRule.title || relatedRule.id) : '';

        taskCard.innerHTML = `
            <div class="task-header">
                <span class="task-priority codicon ${getPriorityIcon(task.priority)}" title="Priority: ${task.priority}"></span>
                <h3 class="task-title">${aiIndicator}${escapeHtml(task.metadata.title)}</h3>
                <div class="task-actions">
                    <button class="task-action-btn edit-task-btn" title="Edit Task"><span class="codicon codicon-edit"></span></button>
                    ${task.ruleId ? `<button class="task-action-btn goto-rule-btn" title="Go to Rule: ${escapeHtml(relatedRuleTitle)}"><span class="codicon codicon-go-to-file"></span></button>` : ''}
                    <button class="task-action-btn assign-me-btn" title="Assign to Me"><span class="codicon codicon-person-add"></span></button>
                    <button class="task-action-btn estimate-complexity-btn" title="Estimate Complexity"><span class="codicon codicon-symbol-numeric"></span> Estimate</button>
                </div>
            </div>
            <p class="task-description">${escapeHtml(description || 'No description.')}</p>
            <div class="task-meta">
                <span class="task-status ${lastError ? 'has-error' : ''}" title="${escapeHtml(errorInfo)}">
                    <span class="codicon ${getStatusIcon(task.status)}"></span> ${task.status}
                    ${errorIcon}
                </span>
                ${assignee ? `<span class="task-assignee" title="Assigned to ${escapeHtml(assignee)}"><span class="codicon codicon-person"></span> ${escapeHtml(assignee)}</span>` : ''}
                ${complexity ? `<span class="task-complexity" title="Complexity"><span class="codicon codicon-circuit-board"></span> ${complexity}/5</span>` : ''}
                ${formattedDueDate ? `<span class="task-due-date" title="Due Date"><span class="codicon codicon-calendar"></span> ${formattedDueDate}</span>` : ''}
                ${relatedRuleTitle ? `<span class="task-rule-link" title="Related Rule: ${escapeHtml(relatedRuleTitle)}"><span class="codicon codicon-link"></span> ${escapeHtml(relatedRuleTitle)}</span>` : ''}
            </div>
        `;

        container.appendChild(taskCard);
    });
}

// Helper to get filtered and sorted tasks
function getFilteredAndSortedTasks() {
    const filteredTasks = state.tasks.filter(task => {
        // Text search
        if (state.filters.search && 
            !task.metadata.title.toLowerCase().includes(state.filters.search) && 
            !(task.metadata.description && task.metadata.description.toLowerCase().includes(state.filters.search))) {
            return false;
        }
        // Status filter
        if (state.filters.status !== 'all' && task.status !== state.filters.status) {
            return false;
        }
        // Priority filter
        if (state.filters.priority !== 'all' && task.priority !== state.filters.priority) {
            return false;
        }
        // Assignee filter
        if (state.filters.assignee === 'unassigned' && task.metadata.assignedTo) {
            return false;
        }
        else if (state.filters.assignee !== 'all' && state.filters.assignee !== 'unassigned' && task.metadata.assignedTo !== state.filters.assignee) {
            return false;
        }
        // Rule link filter
        if (state.filters.ruleLink === 'no-rule' && task.ruleId) {
            return false;
        }
        else if (state.filters.ruleLink !== 'all' && state.filters.ruleLink !== 'no-rule' && task.ruleId !== state.filters.ruleLink) {
            return false;
        }
        
        return true;
    });
    
    // Apply sorting
    const [sortField, sortOrder] = state.filters.sort.split('-');
    filteredTasks.sort((a, b) => {
        let valA, valB;
        
        // Access metadata for these fields
        if (['title', 'description', 'assignedTo', 'createdAt', 'updatedAt', 'dueDate', 'complexity'].includes(sortField)) {
            valA = a.metadata[sortField];
            valB = b.metadata[sortField];
            valA = valA ?? ''; // Default to empty string if undefined
            valB = valB ?? '';
        } else { // status, priority, ruleId are direct properties
            valA = a[sortField];
            valB = b[sortField];
            valA = valA ?? '';
            valB = valB ?? '';
        }
        
        // Type conversions for comparison
        if (sortField === 'title') { 
            valA = String(valA).toLowerCase(); 
            valB = String(valB).toLowerCase(); 
        }
        
        // Ensure timestamps and complexity are numbers for sorting
        if (['createdAt', 'updatedAt', 'dueDate', 'complexity'].includes(sortField)) {
            valA = Number(valA) || 0; // Convert to number, default 0 if conversion fails
            valB = Number(valB) || 0;
        }
        
        // Define priority order including 'critical'
        if (sortField === 'priority') {
            const p = { critical: 4, high: 3, medium: 2, low: 1 };
            valA = p[valA] || 0;
            valB = p[valB] || 0;
        }
        
        // Comparison logic
        if (sortOrder === 'asc') {
            if (valA < valB) {
                return -1;
            }
            if (valA > valB) {
                return 1;
            }
            return 0;
        } else { // desc
            if (valA < valB) {
                return 1;
            }
            if (valA > valB) {
                return -1;
            }
            return 0;
        }
    });
    
    return filteredTasks;
}

// Show notification
function showNotification(message, type = 'info') {
    // In a real implementation, this would show a toast notification
    console.log(`[${type}] ${message}`);
    
    vscode.postMessage({
        command: 'showNotification',
        message,
        type
    });
}

// --- Add/Ensure Helper Functions exist ---
function getPriorityIcon(priority) {
    switch (priority) {
        case 'high': return 'codicon-arrow-up';
        case 'critical': return 'codicon-flame';
        case 'low': return 'codicon-arrow-down';
        case 'medium':
        default: return 'codicon-circle-filled'; // Or maybe empty for medium?
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'todo': return 'codicon-circle-outline';
        case 'in-progress': return 'codicon-sync';
        case 'completed': return 'codicon-check';
        case 'blocked': return 'codicon-stop-circle';
        default: return 'codicon-circle-outline';
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) {
        return '';
    }
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 } 