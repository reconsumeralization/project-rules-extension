import * as vscode from 'vscode'
import * as path from 'path'
import * as crypto from 'crypto'
import { ServerService } from './serverService'

/**
 * Represents an MCP Server Agent
 */
export interface McpAgent {
  id: string
  name: string
  type: string
  description: string
  status: 'active' | 'inactive' | 'pending'
  createdAt: number
  lastActive?: number
  capabilities: string[]
  configuration: any
  stats?: {
    tasksCompleted?: number
    successRate?: number
    averageRuntime?: number
    tokenUsage?: number
  }
}

// Storage key for agents (used as cache/offline fallback)
const MCP_AGENTS_STORAGE_KEY = 'mcpServerAgentsCache'

/**
 * Service for managing MCP Server Agents
 * Interacts with ServerService for backend operations.
 */
export class McpAgentService {
  private _extensionContext: vscode.ExtensionContext
  private _serverService: ServerService
  private _agents: McpAgent[] = []
  private _onAgentsChangedEmitter = new vscode.EventEmitter<void>()
  
  /**
   * Event that fires when agents are changed
   */
  public readonly onAgentsChanged = this._onAgentsChangedEmitter.event
  
  constructor(context: vscode.ExtensionContext, serverService: ServerService) {
    this._extensionContext = context
    this._serverService = serverService
    this._loadAgentsFromCache()

    // Listen for server connection changes to refresh agents
    this._serverService.onStatusChanged(async (status) => {
      if (status === 'connected') {
        console.log('McpAgentService: Server connected, refreshing agents from server...');
        await this.getAgents(true);
      }
    });
  }
  
  /**
   * Gets MCP agents.
   * Fetches from server if connected and forced, otherwise uses cache.
   * @param forceServerFetch If true, bypasses cache and fetches from server if connected.
   */
  public async getAgents(forceServerFetch: boolean = false): Promise<McpAgent[]> {
    if (this._serverService.getConnectionStatus() === 'connected' && forceServerFetch) {
        try {
            console.log('McpAgentService: Fetching agents from server...');
            const serverAgents = await this._serverService.fetchAgents();
            this._agents = serverAgents;
            await this._saveAgentsToCache();
            this._onAgentsChangedEmitter.fire();
            return [...this._agents];
        } catch (error) {
            console.error('McpAgentService: Failed to fetch agents from server:', error);
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showWarningMessage(`Failed to fetch agents from server: ${message}. Using cached data.`);
            return [...this._agents]; 
        }
    } else {
        return [...this._agents];
    }
  }
  
  /**
   * Gets a specific agent by ID from the cache.
   * Note: For real-time data, consider adding a fetchAgentById method.
   */
  public getAgentById(id: string): McpAgent | undefined {
    return this._agents.find(agent => agent.id === id)
  }
  
  /**
   * Creates a new MCP agent on the server and updates local cache.
   */
  public async createAgent(details: Omit<McpAgent, 'id' | 'createdAt' | 'stats' | 'lastActive'>): Promise<McpAgent> {
      if (this._serverService.getConnectionStatus() !== 'connected') {
          throw new Error('Cannot create agent: Not connected to the server.');
      }
      try {
          console.log(`McpAgentService: Creating agent "${details.name}" on server...`);
          const newAgentFromServer = await this._serverService.createAgent(details);
          
          this._agents.push(newAgentFromServer);
          await this._saveAgentsToCache();
          this._onAgentsChangedEmitter.fire();
          console.log(`McpAgentService: Agent "${newAgentFromServer.name}" created successfully (ID: ${newAgentFromServer.id}).`);
          return newAgentFromServer;
      } catch (error) {
          console.error('McpAgentService: Failed to create agent on server:', error);
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to create agent: ${message}`);
          throw error;
      }
  }
  
  /**
   * Updates an existing agent on the server and updates local cache.
   */
  public async updateAgent(id: string, updates: Partial<Omit<McpAgent, 'id' | 'createdAt'>>): Promise<McpAgent | undefined> {
      if (this._serverService.getConnectionStatus() !== 'connected') {
          throw new Error('Cannot update agent: Not connected to the server.');
      }
      try {
          console.log(`McpAgentService: Updating agent ${id} on server...`);
          const updatedAgentFromServer = await this._serverService.updateAgent(id, updates);
          
          const agentIndex = this._agents.findIndex(agent => agent.id === id);
          if (agentIndex !== -1) {
              this._agents[agentIndex] = updatedAgentFromServer;
          } else {
              this._agents.push(updatedAgentFromServer);
          }
          await this._saveAgentsToCache();
          this._onAgentsChangedEmitter.fire();
          console.log(`McpAgentService: Agent ${id} updated successfully.`);
          return updatedAgentFromServer;

      } catch (error) {
          console.error(`McpAgentService: Failed to update agent ${id} on server:`, error);
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to update agent: ${message}`);
          throw error; 
      }
  }
  
  /**
   * Deletes an agent from the server and removes from local cache.
   */
  public async deleteAgent(id: string): Promise<boolean> {
      if (this._serverService.getConnectionStatus() !== 'connected') {
          throw new Error('Cannot delete agent: Not connected to the server.');
      }
      try {
          console.log(`McpAgentService: Deleting agent ${id} from server...`);
          await this._serverService.deleteAgent(id);
          
          const initialLength = this._agents.length;
          this._agents = this._agents.filter(agent => agent.id !== id);
          const deletedLocally = initialLength !== this._agents.length;

          if (deletedLocally) {
              await this._saveAgentsToCache();
              this._onAgentsChangedEmitter.fire();
              console.log(`McpAgentService: Agent ${id} deleted successfully.`);
              return true;
          } else {
              console.warn(`McpAgentService: Agent ${id} deleted from server but not found in local cache.`);
              this._onAgentsChangedEmitter.fire();
              return true;
          }
      } catch (error) {
           console.error(`McpAgentService: Failed to delete agent ${id} from server:`, error);
           const message = error instanceof Error ? error.message : String(error);
           vscode.window.showErrorMessage(`Failed to delete agent: ${message}`);
           throw error;
      }
  }
  
  /**
   * Fetches fresh stats for a specific agent from the server and updates the cache.
   */
  public async refreshAgentStats(agentId: string): Promise<McpAgent | undefined> {
      if (this._serverService.getConnectionStatus() !== 'connected') {
          console.warn(`Cannot refresh stats for agent ${agentId}: Not connected.`);
          // Optionally return the cached agent without updating stats
          return this.getAgentById(agentId);
      }
      const agentIndex = this._agents.findIndex(agent => agent.id === agentId);
      if (agentIndex === -1) {
          console.warn(`Cannot refresh stats for unknown agent ${agentId}`);
          return undefined;
      }

      try {
          console.log(`McpAgentService: Refreshing stats for agent ${agentId}...`);
          const statsFromServer = await this._serverService.fetchAgentStats(agentId);
          
          // Merge fetched stats with existing agent data
          const currentAgent = this._agents[agentIndex];
          currentAgent.stats = { ...(currentAgent.stats || {}), ...statsFromServer }; // Merge stats
          currentAgent.lastActive = Date.now(); // Update last active time
          
          this._agents[agentIndex] = currentAgent; // Update cache
          await this._saveAgentsToCache();
          this._onAgentsChangedEmitter.fire(); // Notify view
          console.log(`McpAgentService: Stats for agent ${agentId} refreshed successfully.`);
          return currentAgent;
      } catch (error) {
          console.error(`McpAgentService: Failed to refresh stats for agent ${agentId}:`, error);
          // Don't show popup error for background refresh usually
          // Maybe update agent status to indicate error?
          return this._agents[agentIndex]; // Return cached agent on error
      }
  }
  
  /**
   * Updates agent stats locally in the cache (Does not sync stats to server currently).
   * Renamed from updateAgentStats to clarify it's local cache only.
   */
  public async updateCachedAgentStats(id: string, statsUpdate: Partial<McpAgent['stats']>): Promise<void> {
    const agentIndex = this._agents.findIndex(agent => agent.id === id)
    if (agentIndex === -1) return;
    
    const agent = this._agents[agentIndex];
    if (!agent.stats) {
        agent.stats = {};
    }
    agent.stats = {
      ...agent.stats,
      ...statsUpdate
    }
    
    agent.lastActive = Date.now()
    this._agents[agentIndex] = agent;
    await this._saveAgentsToCache()
    this._onAgentsChangedEmitter.fire()
  }
  
  /**
   * Toggles an agent's active status on the server.
   */
  public async toggleAgentStatus(id: string): Promise<McpAgent | undefined> {
    const agent = this.getAgentById(id);
    if (!agent) {
      console.warn(`McpAgentService: Cannot toggle status for unknown agent ${id}`);
      return undefined;
    }
    
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    try {
        return await this.updateAgent(id, { status: newStatus });
    } catch (error) {
        return undefined;
    }
  }
  
  /**
   * Resets all agent stats locally (Does not sync to server).
   */
  public async resetAllAgentStats(): Promise<void> {
    let updated = false;
    this._agents.forEach(agent => {
      if (agent.stats) {
        agent.stats = {};
        updated = true;
      }
    });
    if (updated) {
      await this._saveAgentsToCache();
      this._onAgentsChangedEmitter.fire();
      console.log('McpAgentService: Reset local stats for all agents.');
    }
  }
  
  /**
   * Initializes with default agents if cache is empty AND server fetch fails or is unavailable.
   * (Server is now the primary source)
   */
  public async initializeDefaultAgents(): Promise<void> {
    if (this._serverService.getConnectionStatus() === 'connected') {
        try {
            await this.getAgents(true);
            if (this._agents.length > 0) {
                console.log('McpAgentService: Agents fetched from server, skipping default agent creation.');
                return;
            }
        } catch (error) {
             console.warn('McpAgentService: Failed to fetch agents from server during init, will check cache/create defaults.', error);
        }
    }
    
    if (this._agents.length > 0) {
        console.log('McpAgentService: Agents loaded from cache, skipping default agent creation.');
        return;
    }
    
    console.log('McpAgentService: No agents found on server or cache, creating default agents locally...')
    const defaultAgentsData: Omit<McpAgent, 'id' | 'createdAt' | 'stats' | 'lastActive'>[] = [
      {
        name: 'Protocol Validator Agent',
        type: 'Validation',
        description: 'Automatically validates MCPs against schema requirements and best practices.',
        status: 'active',
        capabilities: [
          'Schema compliance checking',
          'Semantic validation of protocol content',
          'Consistency verification across protocol sections',
          'Quality scoring based on completeness and clarity'
        ],
        configuration: {
          schemaVersion: '1.0.0',
          validateOn: ['create', 'update'],
          strictMode: true
        }
      },
      {
        name: 'Integration Assistant Agent',
        type: 'Code Generation',
        description: 'Generates integration code snippets and adapters based on MCP specifications.',
        status: 'active',
        capabilities: [
          'Language-specific SDK generation',
          'API wrapper creation',
          'Configuration file generation',
          'Integration examples for common frameworks'
        ],
        configuration: {
          supportedLanguages: ['TypeScript', 'Python', 'Java', 'Go'],
          templateVersion: '2.1.0',
          includeTests: true
        }
      },
       {
        name: 'Protocol Enhancement Agent',
        type: 'Optimization',
        description: 'Analyzes existing MCPs and suggests improvements based on best practices.',
        status: 'inactive',
        capabilities: [
          'Identifying missing or incomplete sections',
          'Suggesting clarifications for ambiguous content',
          'Recommending additional parameters or constraints',
          'Optimizing for specific use cases or environments'
        ],
        configuration: {
          enhancementModel: 'mcp-optimizer-v1',
          suggestionThreshold: 0.75,
          maxSuggestionsPerRun: 5
        }
      },
      {
        name: 'Monitoring & Analytics Agent',
        type: 'Observability',
        description: 'Tracks MCP usage, performance metrics, and compliance with defined parameters.',
        status: 'active',
        capabilities: [
          'Real-time monitoring of model behavior against MCP specifications',
          'Drift detection and alerting',
          'Usage statistics and performance reporting',
          'Compliance verification for regulated applications'
        ],
        configuration: {
          monitoringInterval: 300,
          alertThresholds: {
            drift: 0.15,
            performance: 0.25,
            compliance: 0.95
          },
          dataRetentionDays: 90
        }
      }
    ];
    
    const createdDefaults: McpAgent[] = [];
    for (const agentDetails of defaultAgentsData) {
        const id = crypto.randomUUID();
        const now = Date.now();
        createdDefaults.push({
            id,
            createdAt: now,
            ...agentDetails,
            stats: {
                tasksCompleted: 0,
                successRate: 0,
                averageRuntime: 0,
                tokenUsage: 0
            }
        });
    }
    
    this._agents = createdDefaults;
    await this._saveAgentsToCache()
    this._onAgentsChangedEmitter.fire()
    console.log(`McpAgentService: Created ${this._agents.length} default agents.`);
  }
  
  /**
   * Refreshes stats for ALL known agents by fetching from the server.
   * Handles individual errors without stopping the batch.
   */
  public async refreshAllAgentStats(): Promise<{ successCount: number; errorCount: number }> {
    if (this._serverService.getConnectionStatus() !== 'connected') {
      console.warn('McpAgentService: Cannot refresh all stats, server status is:', this._serverService.getConnectionStatus());
      throw new Error('Not connected to the MCP server.');
    }

    const agentIds = Array.from(this._agents.map(agent => agent.id));
    let successCount = 0;
    let errorCount = 0;

    console.log(`McpAgentService: Starting batch refresh for ${agentIds.length} agents.`);

    // Use Promise.allSettled to run refreshes concurrently and collect all results
    const results = await Promise.allSettled(
      agentIds.map(id => this.refreshAgentStats(id)) // Use existing single refresh method
    );

    results.forEach((result, index) => {
      const agentId = agentIds[index];
      if (result.status === 'fulfilled') {
        successCount++;
        console.log(`McpAgentService: Batch refresh successful for agent ${agentId}`);
      } else {
        errorCount++;
        console.error(`McpAgentService: Batch refresh failed for agent ${agentId}:`, result.reason);
        // Optionally notify the user or log specific agent failures more visibly
      }
    });

    console.log(`McpAgentService: Batch refresh completed. Success: ${successCount}, Errors: ${errorCount}`);
    // The UI should update automatically due to the _onAgentsChanged.fire() 
    // being called within each successful refreshAgentStats call.
    
    return { successCount, errorCount };
  }
  
  // --- Private Cache Methods ---
  private _loadAgentsFromCache(): void {
    const cachedData = this._extensionContext.globalState.get<McpAgent[]>(MCP_AGENTS_STORAGE_KEY);
    if (cachedData) {
      this._agents = cachedData;
      console.log(`McpAgentService: Loaded ${this._agents.length} agents from cache.`);
    } else {
      console.log(`McpAgentService: No agents found in cache.`);
    }
  }
  
  private async _saveAgentsToCache(): Promise<void> {
    try {
      await this._extensionContext.globalState.update(MCP_AGENTS_STORAGE_KEY, this._agents);
      console.log(`McpAgentService: Saved ${this._agents.length} agents to cache.`);
    } catch (error) {
      console.error('McpAgentService: Failed to save agents to cache:', error);
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to save agents to cache: ${message}`);
    }
  }
} 