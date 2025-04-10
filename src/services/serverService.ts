import * as vscode from 'vscode'
// We need a fetch implementation. Node's built-in fetch is available in recent versions,
// but for wider compatibility in VS Code extensions, 'node-fetch' was often used.
// Let's assume we'll add `node-fetch` or a similar library if needed, or rely on global fetch if env supports it.
// For now, we'll use the global `fetch` and assume it's available.
// import fetch, { Headers, RequestInit, Response } from 'node-fetch'; // Example if using node-fetch v3+

import { Rule, RuleMetadata, createRuleFromFileContent, RuleSuggestion, RuleApplicabilityResult, SyncOperations, SyncResult, RuleConflict } from '../models/rule'
import { McpAgent } from './mcpAgentService' // Import McpAgent type
import { NetworkError, ServerError, AuthError } from '../errors' // Import custom errors

// --- Interfaces (matching server expectations) ---

// Expected response structure when fetching all rules
interface FetchRulesResponse {
  rules: ServerRuleData[]
}

// Expected structure for a single rule from the server
interface ServerRuleData {
  metadata: RuleMetadata // Assuming server returns the full metadata
  content: string
}

// Interface for the context passed to suggestImprovements
interface SuggestImprovementsContext {
  ruleContent?: string;
  referencedFiles?: { [filePath: string]: string };
  activeFileContext?: { filePath: string; content: string };
  projectContext?: { // Add the new projectContext field
    rootDirs?: string[];
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
  };
}

// --- NO MORE STANDALONE FUNCTIONS HERE ---

// Define Connection Status Type
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export class ServerService {
  private _serverUrl: string;
  private _authToken?: string;
  private _connectionStatus: ConnectionStatus = 'disconnected';
  private readonly _onStatusChangedEmitter = new vscode.EventEmitter<ConnectionStatus>();
  private _context: vscode.ExtensionContext; // Store context

  public readonly onStatusChanged: vscode.Event<ConnectionStatus> = this._onStatusChangedEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this._context = context; // Store context for potential future use
    const config = vscode.workspace.getConfiguration('ProjectRules');
    this._serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
    this._authToken = config.get<string>('authToken');
    this._connectionStatus = 'disconnected'; // Initialize status

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('ProjectRules.serverUrl') || e.affectsConfiguration('ProjectRules.authToken')) {
            const newConfig = vscode.workspace.getConfiguration('ProjectRules');
            const oldUrl = this._serverUrl;
            this._serverUrl = newConfig.get<string>('serverUrl', 'http://localhost:3000');
            this._authToken = newConfig.get<string>('authToken');
            console.log('ServerService: Configuration updated.');
            // If URL changed, reset status
            if (oldUrl !== this._serverUrl) {
                this._updateStatus('disconnected');
            }
        }
    }));

    context.subscriptions.push(this._onStatusChangedEmitter); // Dispose emitter
  }
  
  // --- Status Management ---
  private _updateStatus(newStatus: ConnectionStatus) {
      if (this._connectionStatus !== newStatus) {
          this._connectionStatus = newStatus;
          this._onStatusChangedEmitter.fire(this._connectionStatus);
          console.log(`ServerService: Status changed to ${newStatus}`);
          // Optionally update status bar directly from service?
          vscode.window.setStatusBarMessage(`MCP Server: ${newStatus}`, 3000);
      }
  }

  public getConnectionStatus(): ConnectionStatus {
      return this._connectionStatus;
  }

  // --- Configuration Accessors ---
  public getServerUrl(): string {
      return this._serverUrl;
  }
  
  public getAuthToken(): string | undefined {
      return this._authToken;
  }

  // --- Connection Methods ---
  async connect(): Promise<void> {
      if (this._connectionStatus === 'connected' || this._connectionStatus === 'connecting') {
          console.log('ServerService: Already connected or connecting.');
          return;
      }
      this._updateStatus('connecting');
      try {
          // Use a simple health check or fetch rules as a connection test
          await this._fetchApi('/api/health'); // Assume a /api/health endpoint exists
          // Or: await this.fetchRules(); 
          this._updateStatus('connected');
          console.log(`ServerService: Successfully connected to ${this._serverUrl}`);
      } catch (error: any) {
          console.error(`ServerService: Connection failed to ${this._serverUrl}:`, error);
          this._updateStatus('error');
          // Rethrow or handle specific error types if needed
          throw error; 
      }
  }

  async disconnect(): Promise<void> {
      // For stateless API, disconnect mainly updates local state
      console.log('ServerService: Disconnecting...');
      this._updateStatus('disconnected');
      // No actual network call needed unless we need to inform the server
  }

  // --- Core API Methods (using internal _fetchApi) ---
  async fetchRules(): Promise<Rule[]> {
    const response = await this._fetchApi('/api/rules');
    const data = await response.json();
    if (!data || !Array.isArray(data.rules)) {
        throw new Error('Invalid response format from fetchRules endpoint.');
    }
    return data.rules.map((ruleData: ServerRuleData) => 
        createRuleFromFileContent({
        id: ruleData.metadata.id,
        filename: ruleData.metadata.filename,
        content: ruleData.content,
        lastModified: ruleData.metadata.lastModified,
            syncStatus: 'synced'
        })
    );
  }

  async saveRule(rule: Rule): Promise<Rule> {
    const payload = { metadata: rule.metadata, content: rule.content };
    const response = await this._fetchApi('/api/rules', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data?.metadata?.id || typeof data.content !== 'string') {
         throw new Error('Invalid response format from saveRule endpoint.');
    }
    return createRuleFromFileContent({
        id: data.metadata.id,
        filename: data.metadata.filename,
        content: data.content,
        lastModified: data.metadata.lastModified,
        syncStatus: 'synced'
    });
  }

  async deleteRule(ruleId: string): Promise<void> {
    await this._fetchApi(`/api/rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE'
    });
    return;
  }

  async syncRules(operations: SyncOperations): Promise<SyncResult> {
    const response = await this._fetchApi('/api/rules/sync', {
      method: 'POST',
      body: JSON.stringify(operations)
    });
    const data = await response.json();
    if (!data || !Array.isArray(data.created) || !Array.isArray(data.updated) || !Array.isArray(data.deleted) || !Array.isArray(data.conflicts)) {
         throw new Error('Invalid response format from syncRules endpoint.');
    }
    const mapServerRule = (serverRule: ServerRuleData): Rule => createRuleFromFileContent({
        id: serverRule.metadata.id,
        filename: serverRule.metadata.filename,
        content: serverRule.content,
        lastModified: serverRule.metadata.lastModified,
        syncStatus: 'synced'
    });
    return {
        created: data.created.map(mapServerRule),
        updated: data.updated.map(mapServerRule),
        deleted: data.deleted,
        conflicts: data.conflicts.map((conflict: any) => ({ 
            id: conflict.id,
            local: createRuleFromFileContent(conflict.local), 
            server: mapServerRule(conflict.server)
        }))
    };
  }

  /**
   * Suggest improvements for a specific rule based on provided context.
   *
   * @param {string} ruleId - The ID of the rule to get suggestions for.
   * @param {SuggestImprovementsContext} context - The context object containing rule content,
   * referenced files, active file context, and project context.
   * @returns {Promise<RuleSuggestion[]>} A promise that resolves with an array of suggestions.
   */
  async suggestImprovements(ruleId: string, context: SuggestImprovementsContext): Promise<RuleSuggestion[]> {
    console.log("serverService.suggestImprovements called with context:", context); // Log context
    const endpoint = `${this._serverUrl}/rules/${ruleId}/suggestions`;
    try {
      const response = await this._fetchApi(endpoint, {
            method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }), // Send the entire context object
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
        console.error('Error suggesting improvements:', response.status, errorData);
        throw new Error(`Failed to suggest improvements: ${response.status} ${errorData.message || ''}`);
      }
      const suggestions: RuleSuggestion[] = await response.json();
      console.log("Received suggestions:", suggestions); // Log received suggestions
      return suggestions;
    } catch (error: any) {
      console.error('Error in suggestImprovements:', error);
      vscode.window.showErrorMessage(`Error getting suggestions: ${error.message}`);
      return []; // Return empty array on error
    }
  }

  async analyzeRuleApplicability(ruleId: string, fileContent: string, filePath?: string): Promise<RuleApplicabilityResult> {
    const response = await this._fetchApi('/api/rules/analyze', {
      method: 'POST',
      body: JSON.stringify({
        ruleId,
        fileContent,
        filePath
      })
    });
    const data = await response.json();
    if (data?.shouldApply === undefined || data?.confidence === undefined) {
        throw new Error('Invalid response format from analyzeRuleApplicability endpoint.');
    }
    return data;
  }

  async generateRuleFromFile(filename: string, fileContent: string): Promise<Rule | undefined> {
     try {
        const response = await this._fetchApi('/api/rules/generate', {
            method: 'POST',
            body: JSON.stringify({
                filename,
                fileContent
            })
        });
        if (response.status === 204 || (response.headers.get('content-length') === '0')) {
            console.log(`ServerService: generateRuleFromFile returned no rule for ${filename}.`);
            return undefined;
        }
        const data = await response.json();
        if (!data?.rule?.metadata?.id || typeof data.rule.content !== 'string') {
             if (response.status === 200 && !data.rule) { 
                 console.log(`ServerService: generateRuleFromFile returned no rule for ${filename}.`);
                 return undefined;
             }
            throw new Error('Invalid response format from generateRuleFromFile endpoint.');
        }
        return createRuleFromFileContent({
            id: data.rule.metadata.id,
            filename: data.rule.metadata.filename,
            content: data.rule.content,
            lastModified: data.rule.metadata.lastModified,
            syncStatus: 'server-only'
        });
     } catch (error: any) {
         console.error('Error generating rule from file:', error);
         throw error;
     }
  }

  // --- Agent API Methods ---
  async fetchAgents(): Promise<McpAgent[]> {
    const response = await this._fetchApi('/api/agents');
    const data = await response.json();
    // TODO: Add validation for agent list response format
    if (!data || !Array.isArray(data.agents)) {
      throw new Error('Invalid response format from fetchAgents endpoint.');
    }
    return data.agents as McpAgent[]; // Assuming server returns objects matching McpAgent interface
  }

  async createAgent(agentData: Omit<McpAgent, 'id' | 'createdAt' | 'stats' | 'lastActive'>): Promise<McpAgent> {
    const response = await this._fetchApi('/api/agents', {
      method: 'POST',
      body: JSON.stringify(agentData)
    });
    const data = await response.json();
    // TODO: Add validation for created agent response format
    if (!data?.id || !data?.name) { 
      throw new Error('Invalid response format from createAgent endpoint.');
    }
    return data as McpAgent;
  }

  async updateAgent(agentId: string, updates: Partial<Omit<McpAgent, 'id' | 'createdAt'>>): Promise<McpAgent> {
    const response = await this._fetchApi(`/api/agents/${encodeURIComponent(agentId)}`, {
      method: 'PUT', // Or PATCH depending on server implementation
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    // TODO: Add validation for updated agent response format
    if (!data?.id || !data?.name) { 
      throw new Error('Invalid response format from updateAgent endpoint.');
    }
    return data as McpAgent;
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this._fetchApi(`/api/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE'
    });
    return; // Success indicated by non-error response
  }

  // Add new method for fetching agent stats
  async fetchAgentStats(agentId: string): Promise<McpAgent['stats']> {
    const response = await this._fetchApi(`/api/agents/${encodeURIComponent(agentId)}/stats`);
    const data = await response.json();

    // Validate the structure of the received stats data
    if (typeof data !== 'object' || data === null) { 
      throw new ServerError('Invalid response format: Expected stats object.', 'INVALID_STATS_FORMAT', response.status);
    }
    
    // Type guard to check individual stats properties (optional check)
    const isValidStat = (value: any): value is number | undefined => typeof value === 'number' || typeof value === 'undefined';

    if (!isValidStat(data.tasksCompleted) || 
        !isValidStat(data.successRate) || 
        !isValidStat(data.averageRuntime) || 
        !isValidStat(data.tokenUsage)) {
      console.warn('ServerService: Received stats object with unexpected property types:', data); 
      // Decide if this is a hard error or if we proceed with valid parts
      // For now, let's treat it as an error to be strict.
       throw new ServerError('Invalid response format: Stats object properties have incorrect types.', 'INVALID_STATS_TYPES', response.status);
    }

    // Return the validated (or partially validated) stats object
    return data as McpAgent['stats']; 
  }

  // --- Private Fetch Implementation ---
  /**
   * Wrapper around the fetch API to handle common logic like base URL,
   * authorization header, and basic error handling.
   * Throws an error for non-OK responses.
   */
  private async _fetchApi(
    apiPath: string,
    options: RequestInit = {},
  ): Promise<Response> {
    // Construct full URL using instance properties
    const baseUrl = this._serverUrl.endsWith('/') ? this._serverUrl.slice(0, -1) : this._serverUrl;
    const requestPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const url = `${baseUrl}${requestPath}`;

    // Set up headers
    const headers = new Headers(options.headers || {});
    if ((options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH') && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    headers.set('Accept', 'application/json');

    // Add auth token if available
    if (this._authToken) {
      headers.set('Authorization', `Bearer ${this._authToken}`);
    }

    console.log(`ServerService: Fetching ${options.method || 'GET'} ${url}`);

    try {
      // Perform the fetch request
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Check for non-OK responses
      if (!response.ok) {
        let errorData: any = { error: { code: `HTTP_${response.status}`, message: `Server responded with status ${response.status}` } };
        try {
          // Try parsing JSON error body
          const jsonError = await response.json();
          if (jsonError && jsonError.error) {
            errorData = jsonError;
          }
        } catch (parseError) {
          console.warn('ServerService: Failed to parse error response as JSON.', parseError);
          // Try reading text if JSON parsing fails
          try {
            const textError = await response.text();
            if (textError) { // Only assign if textError is not empty
                 errorData.error.message = textError;
            }
          } catch(textErr) { /* Ignore if reading text also fails */}
        }
        const errorMessage = errorData.error?.message || `Server error (${response.status})`;
        const errorCode = errorData.error?.code || `HTTP_${response.status}`;
        console.error(`ServerService Error: ${errorCode} - ${errorMessage}`, errorData.error?.details);
        
        // Handle specific auth errors
        if (response.status === 401 || response.status === 403) {
            if (this._connectionStatus !== 'connecting') this._updateStatus('error');
            throw new AuthError(errorMessage); // Use specific AuthError
        }

        // Throw ServerError for other non-OK responses
        if (this._connectionStatus !== 'connecting') this._updateStatus('error');
        throw new ServerError(errorMessage, errorCode, response.status, errorData.error?.details);
      }

      // Handle successful empty responses (e.g., 204 No Content, successful DELETE)
      if (response.status === 204 || (options.method === 'DELETE' && response.ok)) {
        // Return a new Response with null body but correct status/headers
        return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
      }

      // Handle successful responses with JSON body
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        // Clone response to allow checking body without consuming it for the caller
        const clonedResponse = response.clone();
        try {
          await clonedResponse.json(); // Attempt to parse to check validity
          return response; // Return the original response if JSON is valid
        } catch (e) {
          console.warn(`ServerService: Received status ${response.status} with content-type JSON, but body is empty or invalid.`);
          // Return a Response with null body but correct status/headers if JSON is invalid/empty
          return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
        }
      }
      
      // If not an empty response or JSON, return the response as is (e.g., for plain text)
      return response;

    } catch (error: any) {
      // Handle network errors or errors thrown from the non-OK check
      console.error(`ServerService Network/Fetch Error: Failed to fetch ${url}`, error);
      
      // Update status for network errors
      this._updateStatus('error');
      
      // If it's already one of our structured errors, re-throw it
      if (error instanceof NetworkError || error instanceof ServerError || error instanceof AuthError) {
        throw error;
      }
      
      // Otherwise, wrap it in a NetworkError
      throw new NetworkError(`${error.message || 'Unknown fetch error'}`, error);
    }
  }

  /**
   * Uploads multiple rules to the server.
   * Returns the rules as saved by the server (potentially with updated metadata).
   */
  async uploadRules(rules: Rule[]): Promise<Rule[]> {
    const payload = rules.map(rule => ({ metadata: rule.metadata, content: rule.content }));
    const response = await this._fetchApi('/api/rules/batch', { // Assuming POST /api/rules/batch
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data || !Array.isArray(data.rules)) {
      throw new Error('Invalid response format from uploadRules endpoint.');
    }
    // Assuming server returns the full rule data for successfully saved rules
    return data.rules.map((ruleData: ServerRuleData) => 
      createRuleFromFileContent({
          id: ruleData.metadata.id,
          filename: ruleData.metadata.filename,
          content: ruleData.content,
          lastModified: ruleData.metadata.lastModified,
          syncStatus: 'synced' // Rules are synced after successful upload
      })
    );
  }

  /**
   * Deletes multiple rules from the server.
   * Returns an array of IDs that were successfully deleted (if server provides it).
   * Throws an error if the batch operation fails.
   */
  async deleteRules(ruleIds: string[]): Promise<string[]> {
    const response = await this._fetchApi('/api/rules/batch', { // Assuming DELETE /api/rules/batch
      method: 'DELETE',
      body: JSON.stringify({ ids: ruleIds })
    });
    // Server might return 204 No Content on success, or JSON with deleted IDs
    if (response.status === 204) {
      return ruleIds; // Assume all requested IDs were deleted if status is 204
    }
    const data = await response.json();
    // Adjust based on actual server response format
    if (data && Array.isArray(data.deletedIds)) {
      return data.deletedIds;
    }
    // If response is unexpected, assume none were deleted or throw error
    console.warn('Unexpected response format from deleteRules endpoint:', data);
    // Depending on strictness, either return [] or throw an error
    // throw new Error('Unexpected response format from deleteRules endpoint.');
    return []; // For now, return empty array on unexpected response
  }
} 

export function analyzeRuleApplicability(id: string, fileContent: string) {
  throw new Error('Function not implemented.')
}


export function suggestRuleImprovements(id: string) {
  throw new Error('Function not implemented.')
}


export function generateRuleFromFile(filename: string, fileContent: string) {
  throw new Error('Function not implemented.')
}
