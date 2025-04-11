import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { 
  AgentConfig, 
  AgentStatistics, 
  AgentLogEntry,
  createEmptyAgentConfig,
  createEmptyAgentStatistics
} from '../models/mcp';

/**
 * Service for managing AI agents in the Project Rules extension
 */
export class AgentService {
  private agents: Map<string, AgentConfig> = new Map();
  private statistics: Map<string, AgentStatistics> = new Map();
  private agentDirectory: string;
  private statsDirectory: string;
  private disposables: vscode.Disposable[] = [];
  private autonomyEnabled: boolean = false;
  private cycleTimers: Map<string, NodeJS.Timeout> = new Map();

  private _onAgentsChanged = new vscode.EventEmitter<void>();
  readonly onAgentsChanged = this._onAgentsChanged.event;

  private _onAgentStatsChanged = new vscode.EventEmitter<{ agentId: string }>();
  readonly onAgentStatsChanged = this._onAgentStatsChanged.event;

  constructor(storageUri: vscode.Uri) {
    // Define directory paths for storing agent data
    this.agentDirectory = path.join(storageUri.fsPath, 'agents');
    this.statsDirectory = path.join(storageUri.fsPath, 'agent-stats');

    // Ensure directories exist
    if (!fs.existsSync(this.agentDirectory)) {
      fs.mkdirSync(this.agentDirectory, { recursive: true });
    }
    if (!fs.existsSync(this.statsDirectory)) {
      fs.mkdirSync(this.statsDirectory, { recursive: true });
    }

    // Load existing agents and statistics
    this.loadAgents();
    this.loadAgentStatistics();

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('projectRules.autonomyEnabled')) {
          this.updateAutonomyStatus();
        }
      })
    );

    // Initialize autonomy status
    this.updateAutonomyStatus();
  }

  /**
   * Updates the autonomy status based on user settings
   */
  private updateAutonomyStatus(): void {
    const config = vscode.workspace.getConfiguration('projectRules');
    const newStatus = config.get<boolean>('autonomyEnabled', false);
    
    if (this.autonomyEnabled !== newStatus) {
      this.autonomyEnabled = newStatus;
      
      // Start or stop agent cycles based on new status
      if (this.autonomyEnabled) {
        this.startAgentCycles();
      } else {
        this.stopAgentCycles();
      }
    }
  }

  /**
   * Start scheduled cycles for all active agents
   */
  private startAgentCycles(): void {
    this.stopAgentCycles(); // Clear any existing timers

    for (const [id, agent] of this.agents.entries()) {
      if (agent.state === 'active' && agent.scheduledCycles.enabled && this.autonomyEnabled) {
        this.scheduleAgentCycle(id, agent);
      }
    }
  }

  /**
   * Schedule a cycle for a specific agent
   */
  private scheduleAgentCycle(agentId: string, agent: AgentConfig): void {
    if (this.cycleTimers.has(agentId)) {
      clearTimeout(this.cycleTimers.get(agentId));
    }

    // Calculate next run time
    const now = new Date();
    let nextRun = new Date();
    
    if (agent.scheduledCycles.lastRun) {
      const lastRun = new Date(agent.scheduledCycles.lastRun);
      nextRun = new Date(lastRun.getTime() + agent.scheduledCycles.interval * 60000);
      
      if (nextRun < now) {
        nextRun = new Date(now.getTime() + 1000); // Run soon if we missed the window
      }
    } else {
      // First run, schedule after delay
      nextRun = new Date(now.getTime() + agent.scheduledCycles.interval * 60000);
    }

    // Update next run time
    agent.scheduledCycles.nextRun = nextRun.toISOString();
    this.saveAgent(agent);

    // Schedule the agent cycle
    const timeUntilNextRun = Math.max(1000, nextRun.getTime() - now.getTime());
    
    this.cycleTimers.set(agentId, setTimeout(() => {
      this.runAgentCycle(agentId);
    }, timeUntilNextRun));
  }

  /**
   * Run a cycle for a specific agent
   */
  private async runAgentCycle(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.state !== 'active' || !this.autonomyEnabled) {
      return;
    }

    try {
      // Log the cycle start
      this.logAgentActivity(agentId, 'Cycle started', 'Starting scheduled agent cycle', 'success');
      
      // Record last run time
      const now = new Date().toISOString();
      agent.scheduledCycles.lastRun = now;
      this.saveAgent(agent);

      // TODO: Implement actual agent cycle logic here
      // This could involve analyzing project files, suggesting rules, etc.

      // Log the cycle completion
      this.logAgentActivity(agentId, 'Cycle completed', 'Successfully completed agent cycle', 'success');
    } catch (error) {
      // Log any errors
      this.logAgentActivity(
        agentId, 
        'Cycle error', 
        `Error during agent cycle: ${error instanceof Error ? error.message : String(error)}`, 
        'error'
      );
    } finally {
      // Schedule the next run
      if (agent.scheduledCycles.enabled && this.autonomyEnabled) {
        this.scheduleAgentCycle(agentId, agent);
      }
    }
  }

  /**
   * Stop all scheduled agent cycles
   */
  private stopAgentCycles(): void {
    // Clear all timers
    for (const timer of this.cycleTimers.values()) {
      clearTimeout(timer);
    }
    this.cycleTimers.clear();
  }

  /**
   * Load all agents from the filesystem
   */
  private loadAgents(): void {
    try {
      const files = fs.readdirSync(this.agentDirectory);
      this.agents.clear();

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.agentDirectory, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const agent = JSON.parse(content) as AgentConfig;
            this.agents.set(agent.id, agent);
          } catch (err) {
            console.error(`Error loading agent file ${file}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error loading agents:', err);
    }
  }

  /**
   * Load agent statistics from the filesystem
   */
  private loadAgentStatistics(): void {
    try {
      const files = fs.readdirSync(this.statsDirectory);
      this.statistics.clear();

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.statsDirectory, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const stats = JSON.parse(content) as AgentStatistics;
            this.statistics.set(stats.id, stats);
          } catch (err) {
            console.error(`Error loading statistics file ${file}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error loading agent statistics:', err);
    }
  }

  /**
   * Save an agent to disk
   */
  private saveAgent(agent: AgentConfig): void {
    try {
      const filePath = path.join(this.agentDirectory, `${agent.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf8');
      this.agents.set(agent.id, agent);
      this._onAgentsChanged.fire();
    } catch (err) {
      console.error(`Error saving agent ${agent.id}:`, err);
      throw new Error(`Failed to save agent: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Save agent statistics to disk
   */
  private saveAgentStatistics(stats: AgentStatistics): void {
    try {
      const filePath = path.join(this.statsDirectory, `${stats.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), 'utf8');
      this.statistics.set(stats.id, stats);
      this._onAgentStatsChanged.fire({ agentId: stats.id });
    } catch (err) {
      console.error(`Error saving statistics for agent ${stats.id}:`, err);
      throw new Error(`Failed to save agent statistics: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get an agent by its ID
   */
  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  /**
   * Create a new agent
   */
  createAgent(partial: Partial<AgentConfig> = {}): AgentConfig {
    const newAgent = { ...createEmptyAgentConfig(), ...partial };
    
    // Ensure updated timestamp is current
    newAgent.updated = new Date().toISOString();
    
    this.saveAgent(newAgent);
    
    // Create initial statistics for the agent
    const stats = createEmptyAgentStatistics(newAgent.id, newAgent.name);
    this.saveAgentStatistics(stats);
    
    // Start cycle if enabled
    if (newAgent.state === 'active' && newAgent.scheduledCycles.enabled && this.autonomyEnabled) {
      this.scheduleAgentCycle(newAgent.id, newAgent);
    }
    
    return newAgent;
  }

  /**
   * Update an existing agent
   */
  updateAgent(id: string, updates: Partial<AgentConfig>): AgentConfig {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent with ID ${id} not found`);
    }

    const wasActive = agent.state === 'active' && agent.scheduledCycles.enabled;
    
    // Update the agent properties
    const updatedAgent: AgentConfig = {
      ...agent,
      ...updates,
      updated: new Date().toISOString(),
      id // Ensure ID doesn't change
    };
    
    // Save the updated agent
    this.saveAgent(updatedAgent);
    
    // Update the agent name in statistics if it changed
    if (agent.name !== updatedAgent.name) {
      const stats = this.statistics.get(id);
      if (stats) {
        stats.agentName = updatedAgent.name;
        this.saveAgentStatistics(stats);
      }
    }
    
    // Handle changes to scheduling
    const nowActive = updatedAgent.state === 'active' && updatedAgent.scheduledCycles.enabled;
    
    if (wasActive && !nowActive) {
      // Agent was deactivated, clear any scheduled cycles
      if (this.cycleTimers.has(id)) {
        clearTimeout(this.cycleTimers.get(id));
        this.cycleTimers.delete(id);
      }
    } else if (!wasActive && nowActive && this.autonomyEnabled) {
      // Agent was activated, schedule cycles
      this.scheduleAgentCycle(id, updatedAgent);
    } else if (wasActive && nowActive && 
              (agent.scheduledCycles.interval !== updatedAgent.scheduledCycles.interval)) {
      // Interval changed, reschedule
      this.scheduleAgentCycle(id, updatedAgent);
    }
    
    return updatedAgent;
  }

  /**
   * Delete an agent
   */
  deleteAgent(id: string): void {
    if (!this.agents.has(id)) {
      throw new Error(`Agent with ID ${id} not found`);
    }
    
    // Remove any scheduled cycles
    if (this.cycleTimers.has(id)) {
      clearTimeout(this.cycleTimers.get(id));
      this.cycleTimers.delete(id);
    }
    
    // Delete the agent file
    try {
      const filePath = path.join(this.agentDirectory, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Error deleting agent file for ${id}:`, err);
    }
    
    // Remove from memory
    this.agents.delete(id);
    this._onAgentsChanged.fire();
    
    // We'll keep the statistics for historical purposes, but could delete them if needed
  }

  /**
   * Get statistics for an agent
   */
  getAgentStatistics(agentId: string): AgentStatistics | undefined {
    return this.statistics.get(agentId);
  }

  /**
   * Get statistics for all agents
   */
  getAllAgentStatistics(): AgentStatistics[] {
    return Array.from(this.statistics.values());
  }

  /**
   * Log an activity for an agent
   */
  logAgentActivity(
    agentId: string,
    action: string,
    details: string,
    status: 'success' | 'warning' | 'error',
    duration?: number,
    resourceUsage?: { memory: number; cpu: number }
  ): void {
    // Get agent statistics or create if not exists
    let stats = this.statistics.get(agentId);
    const agent = this.agents.get(agentId);
    
    if (!stats && agent) {
      stats = createEmptyAgentStatistics(agentId, agent.name);
    } else if (!stats) {
      throw new Error(`Cannot log activity for unknown agent ${agentId}`);
    }
    
    // Create log entry
    const logEntry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      status,
      duration,
      resourceUsage
    };
    
    // Add to logs
    stats.logs.push(logEntry);
    
    // Limit log size to prevent excessively large files
    const maxLogEntries = 1000;
    if (stats.logs.length > maxLogEntries) {
      stats.logs = stats.logs.slice(-maxLogEntries);
    }
    
    // Update statistics period 
    const now = new Date();
    stats.period.to = now.toISOString();
    
    // Update statistics based on activity
    if (status === 'success') {
      if (action.includes('task')) {
        stats.productivity.tasksCompleted++;
      } else if (action.includes('rule')) {
        stats.productivity.rulesGenerated++;
      } else if (action.includes('suggestion') || action.includes('improvement')) {
        stats.productivity.improvementsSuggested++;
      }
    }
    
    // Update resource usage if provided
    if (resourceUsage) {
      stats.resourceUsage.memory = Math.max(stats.resourceUsage.memory, resourceUsage.memory);
      stats.resourceUsage.cpu = Math.max(stats.resourceUsage.cpu, resourceUsage.cpu);
    }
    
    // Save updated statistics
    this.saveAgentStatistics(stats);
  }

  /**
   * Update metrics for an agent after a suggestion is made
   */
  updateAgentMetrics(
    agentId: string,
    suggestionOutcome: 'accepted' | 'rejected' | 'modified',
    processingTime?: number
  ): void {
    const stats = this.statistics.get(agentId);
    if (!stats) {
      return;
    }
    
    // Update suggestion metrics
    stats.quality.suggestionCount++;
    
    switch (suggestionOutcome) {
      case 'accepted':
        // Increment acceptance rate numerator
        const totalSuggestions = stats.quality.suggestionCount;
        const acceptedSuggestions = Math.round(stats.quality.acceptanceRate * (totalSuggestions - 1)) + 1;
        stats.quality.acceptanceRate = acceptedSuggestions / totalSuggestions;
        stats.quality.rejectionRate = 1 - stats.quality.acceptanceRate - (stats.quality.userModifications / totalSuggestions);
        break;
      case 'rejected':
        // Increment rejection rate numerator
        const totalSugs = stats.quality.suggestionCount;
        const rejectedSugs = Math.round(stats.quality.rejectionRate * (totalSugs - 1)) + 1;
        stats.quality.rejectionRate = rejectedSugs / totalSugs;
        stats.quality.acceptanceRate = 1 - stats.quality.rejectionRate - (stats.quality.userModifications / totalSugs);
        break;
      case 'modified':
        // Track user modifications
        stats.quality.userModifications++;
        const total = stats.quality.suggestionCount;
        stats.quality.userModifications = Math.min(stats.quality.userModifications, total);
        // Adjust rates to account for modified suggestions
        stats.quality.acceptanceRate = (stats.quality.acceptanceRate * total - 1) / total;
        stats.quality.rejectionRate = (stats.quality.rejectionRate * total - 1) / total;
        break;
    }
    
    // Update processing time metrics if provided
    if (processingTime !== undefined) {
      // Initialize if this is the first data point
      if (stats.processingTime.min === 0 || processingTime < stats.processingTime.min) {
        stats.processingTime.min = processingTime;
      }
      
      if (processingTime > stats.processingTime.max) {
        stats.processingTime.max = processingTime;
      }
      
      // Update average (simple moving average)
      const currentTotal = stats.processingTime.average * (stats.quality.suggestionCount - 1);
      stats.processingTime.average = (currentTotal + processingTime) / stats.quality.suggestionCount;
    }
    
    // Save updated statistics
    this.saveAgentStatistics(stats);
  }

  /**
   * Refresh agent data from disk
   */
  refresh(): void {
    this.loadAgents();
    this.loadAgentStatistics();
    this._onAgentsChanged.fire();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopAgentCycles();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this._onAgentsChanged.dispose();
    this._onAgentStatsChanged.dispose();
  }
} 