import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MCPProtocol, createEmptyProtocol } from '../models/mcp';
import { validateProtocol } from '../utils/protocolValidator';

/**
 * Service for managing MCP protocols in the Project Rules extension
 */
export class ProtocolService {
  private protocols: Map<string, MCPProtocol> = new Map();
  private protocolsDirectory: string;
  private disposables: vscode.Disposable[] = [];

  private _onProtocolsChanged = new vscode.EventEmitter<void>();
  readonly onProtocolsChanged = this._onProtocolsChanged.event;

  private _onProtocolValidated = new vscode.EventEmitter<{ 
    protocolId: string; 
    isValid: boolean;
    validationResults: { valid: boolean; errors: string[] };
  }>();
  readonly onProtocolValidated = this._onProtocolValidated.event;

  constructor(storageUri: vscode.Uri) {
    // Define directory paths for storing protocol data
    this.protocolsDirectory = path.join(storageUri.fsPath, 'protocols');

    // Ensure directories exist
    if (!fs.existsSync(this.protocolsDirectory)) {
      fs.mkdirSync(this.protocolsDirectory, { recursive: true });
    }

    // Load existing protocols
    this.loadProtocols();
  }

  /**
   * Load all protocols from the filesystem
   */
  private loadProtocols(): void {
    try {
      const files = fs.readdirSync(this.protocolsDirectory);
      this.protocols.clear();

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.protocolsDirectory, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const protocol = JSON.parse(content) as MCPProtocol;
            this.protocols.set(protocol.id, protocol);
          } catch (err) {
            console.error(`Error loading protocol file ${file}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error loading protocols:', err);
    }
  }

  /**
   * Save a protocol to disk
   */
  private saveProtocol(protocol: MCPProtocol): void {
    try {
      const filePath = path.join(this.protocolsDirectory, `${protocol.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(protocol, null, 2), 'utf8');
      this.protocols.set(protocol.id, protocol);
      this._onProtocolsChanged.fire();
    } catch (err) {
      console.error(`Error saving protocol ${protocol.id}:`, err);
      throw new Error(`Failed to save protocol: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get all registered protocols
   */
  getAllProtocols(): MCPProtocol[] {
    return Array.from(this.protocols.values());
  }

  /**
   * Get a protocol by its ID
   */
  getProtocol(id: string): MCPProtocol | undefined {
    return this.protocols.get(id);
  }

  /**
   * Create a new protocol
   */
  createProtocol(partial: Partial<MCPProtocol> = {}): MCPProtocol {
    const newProtocol = { ...createEmptyProtocol(), ...partial };
    
    // Ensure updated timestamp is current
    newProtocol.updatedAt = new Date().toISOString();
    
    this.saveProtocol(newProtocol);
    return newProtocol;
  }

  /**
   * Update an existing protocol
   */
  updateProtocol(id: string, updates: Partial<MCPProtocol>): MCPProtocol {
    const protocol = this.protocols.get(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    // Update the protocol properties
    const updatedProtocol: MCPProtocol = {
      ...protocol,
      ...updates,
      updatedAt: new Date().toISOString(),
      id // Ensure ID doesn't change
    };
    
    // Save the updated protocol
    this.saveProtocol(updatedProtocol);
    return updatedProtocol;
  }

  /**
   * Delete a protocol
   */
  deleteProtocol(id: string): void {
    if (!this.protocols.has(id)) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    // Delete the protocol file
    try {
      const filePath = path.join(this.protocolsDirectory, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Error deleting protocol file for ${id}:`, err);
    }
    
    // Remove from memory
    this.protocols.delete(id);
    this._onProtocolsChanged.fire();
  }

  /**
   * Validate a protocol against the MCP schema
   */
  validateProtocol(id: string): { valid: boolean, errors: Array<{ field: string, message: string, severity: string }> } {
    const protocol = this.getProtocol(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    const results = validateProtocol(protocol);
    
    // Convert validation errors to a simpler format for return
    const simpleErrors = results.errors.map(err => ({
      field: err.path,
      message: err.message,
      severity: err.severity === 'error' ? 'error' : 'warning'
    }));
    
    // Update the protocol with validation status
    const updatedProtocol: MCPProtocol = {
      ...protocol,
      validated: results.isValid,
      validationErrors: results.errors.map(err => ({
        field: err.path,
        message: err.message,
        severity: err.severity === 'error' ? 'error' : 'warning'
      })),
      lastValidation: new Date().toISOString(),
      // Ensure these exist with at least empty objects
      usageExamples: protocol.usageExamples || {},
      trainingData: protocol.trainingData || {},
      performance: protocol.performance || {},
      ethics: protocol.ethics || {}
    };
    
    // Save the updated protocol
    this.saveProtocol(updatedProtocol);
    
    // Emit validation event
    this._onProtocolValidated.fire({
      protocolId: id,
      isValid: results.isValid,
      validationResults: {
        valid: results.isValid,
        errors: simpleErrors.map(err => err.message)
      }
    });
    
    return {
      valid: results.isValid,
      errors: simpleErrors
    };
  }

  /**
   * Duplicate a protocol
   */
  duplicateProtocol(id: string, newName?: string): MCPProtocol {
    const protocol = this.getProtocol(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    // Create a duplicate with a new ID and optionally a new name
    const duplicate = {
      ...protocol,
      id: crypto.randomUUID(),
      name: newName || `${protocol.name} (Copy)`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      version: protocol.version.split('.').map((v, i) => i === 2 ? '0' : v).join('.') // Reset patch version
    };
    
    this.saveProtocol(duplicate);
    return duplicate;
  }

  /**
   * Export a protocol to a file
   */
  async exportProtocol(id: string): Promise<void> {
    const protocol = this.getProtocol(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    // Ask user where to save the file
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${protocol.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`),
      filters: {
        'JSON Files': ['json']
      }
    });
    
    if (!uri) {
      return; // User cancelled
    }
    
    // Write the file
    fs.writeFileSync(uri.fsPath, JSON.stringify(protocol, null, 2), 'utf8');
    
    vscode.window.showInformationMessage(`Protocol '${protocol.name}' exported successfully.`);
  }

  /**
   * Import a protocol from a file
   */
  async importProtocol(): Promise<MCPProtocol | undefined> {
    // Ask user for file to import
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'JSON Files': ['json']
      }
    });
    
    if (!uris || uris.length === 0) {
      return; // User cancelled
    }
    
    try {
      // Read the file
      const content = fs.readFileSync(uris[0].fsPath, 'utf8');
      const importedProtocol = JSON.parse(content) as MCPProtocol;
      
      // Check if this protocol already exists
      if (this.protocols.has(importedProtocol.id)) {
        const overwrite = await vscode.window.showQuickPick(['Create New', 'Overwrite Existing'], {
          placeHolder: 'A protocol with this ID already exists. Create new or overwrite?'
        });
        
        if (overwrite === 'Create New') {
          // Generate a new ID for the protocol
          importedProtocol.id = crypto.randomUUID();
          importedProtocol.name = `${importedProtocol.name} (Imported)`;
        } else if (overwrite !== 'Overwrite Existing') {
          return; // User cancelled
        }
      }
      
      // Update timestamps
      importedProtocol.updatedAt = new Date().toISOString();
      if (!importedProtocol.createdAt) {
        importedProtocol.createdAt = importedProtocol.updatedAt;
      }
      
      // Save the imported protocol
      this.saveProtocol(importedProtocol);
      
      vscode.window.showInformationMessage(`Protocol '${importedProtocol.name}' imported successfully.`);
      return importedProtocol;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to import protocol: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Find protocols by search criteria
   */
  searchProtocols(query: string): MCPProtocol[] {
    const searchTerms = query.toLowerCase().split(/\s+/);
    
    return Array.from(this.protocols.values()).filter(protocol => {
      const searchableText = [
        protocol.name,
        protocol.description,
        protocol.modelType,
        protocol.author,
        ...(protocol.parameters.map(p => p.name) || [])
      ].join(' ').toLowerCase();
      
      return searchTerms.every(term => searchableText.includes(term));
    });
  }

  /**
   * Increment the version of a protocol
   */
  incrementVersion(
    id: string, 
    type: 'major' | 'minor' | 'patch' = 'patch'
  ): MCPProtocol {
    const protocol = this.getProtocol(id);
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    // Parse version and increment appropriate part
    const versionParts = protocol.version.split('.').map(Number);
    
    if (type === 'major') {
      versionParts[0] += 1;
      versionParts[1] = 0;
      versionParts[2] = 0;
    } else if (type === 'minor') {
      versionParts[1] += 1;
      versionParts[2] = 0;
    } else {
      versionParts[2] += 1;
    }
    
    // Update protocol with new version
    const updatedProtocol = {
      ...protocol,
      version: versionParts.join('.'),
      updated: new Date().toISOString()
    };
    
    this.saveProtocol(updatedProtocol);
    return updatedProtocol;
  }

  /**
   * Refresh protocol data from disk
   */
  refresh(): void {
    this.loadProtocols();
    this._onProtocolsChanged.fire();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this._onProtocolsChanged.dispose();
    this._onProtocolValidated.dispose();
  }
} 