import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { 
  MCPProtocol, 
  ValidationError,
  createEmptyProtocol
} from '../models/mcp';

// Define the validation result interfaces locally
interface MCPValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: MCPValidationWarning[];
  suggestions: MCPValidationSuggestion[];
}

interface MCPValidationWarning {
  field: string;
  message: string;
  severity: string;
}

interface MCPValidationSuggestion {
  field: string;
  message: string;
  suggestion: string;
}

/**
 * Service for MCP protocol management and validation
 */
export class MCPProtocolService {
  private protocolsCache: Map<string, MCPProtocol> = new Map();
  private protocolsDir: string;
  
  constructor(context: vscode.ExtensionContext) {
    this.protocolsDir = path.join(context.globalStoragePath, 'protocols');
    this.ensureDirectoryExists(this.protocolsDir);
    this.loadProtocols();
  }
  
  /**
   * Loads all protocols from the protocols directory
   */
  private async loadProtocols() {
    try {
      const files = await fs.promises.readdir(this.protocolsDir);
      const protocolFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of protocolFiles) {
        try {
          const content = await fs.promises.readFile(path.join(this.protocolsDir, file), 'utf-8');
          const protocol = JSON.parse(content) as MCPProtocol;
          this.protocolsCache.set(protocol.id, protocol);
        } catch (err) {
          console.error(`Error loading protocol file ${file}:`, err);
        }
      }
    } catch (err) {
      console.error('Error loading protocols:', err);
    }
  }
  
  /**
   * Gets all available protocols
   */
  public async getProtocols(): Promise<MCPProtocol[]> {
    await this.loadProtocols(); // Refresh cache
    return Array.from(this.protocolsCache.values());
  }
  
  /**
   * Gets a protocol by ID
   */
  public async getProtocol(id: string): Promise<MCPProtocol | undefined> {
    if (!this.protocolsCache.has(id)) {
      await this.loadProtocols();
    }
    return this.protocolsCache.get(id);
  }
  
  /**
   * Creates a new protocol
   */
  public async createProtocol(protocol?: Partial<MCPProtocol>): Promise<MCPProtocol> {
    const newProtocol = createEmptyProtocol();
    
    if (protocol) {
      Object.assign(newProtocol, protocol);
    }
    
    await this.saveProtocol(newProtocol);
    return newProtocol;
  }
  
  /**
   * Updates an existing protocol
   */
  public async updateProtocol(id: string, updates: Partial<MCPProtocol>): Promise<MCPProtocol> {
    const protocol = await this.getProtocol(id);
    
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    const updatedProtocol = {
      ...protocol,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await this.saveProtocol(updatedProtocol);
    return updatedProtocol;
  }
  
  /**
   * Deletes a protocol by ID
   */
  public async deleteProtocol(id: string): Promise<void> {
    const protocol = await this.getProtocol(id);
    
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    const filePath = path.join(this.protocolsDir, `${id}.json`);
    
    try {
      await fs.promises.unlink(filePath);
      this.protocolsCache.delete(id);
    } catch (err) {
      console.error(`Error deleting protocol ${id}:`, err);
      throw err;
    }
  }
  
  /**
   * Validates a protocol against the MCP schema
   */
  public validateProtocol(protocol: MCPProtocol): MCPValidationResult {
    const errors: ValidationError[] = [];
    const warnings: MCPValidationWarning[] = [];
    const suggestions: MCPValidationSuggestion[] = [];
    
    // Validate required fields
    if (!protocol.id) {
      errors.push({
        field: 'id',
        message: 'Protocol ID is required',
        severity: 'error'
      });
    }
    
    if (!protocol.name) {
      errors.push({
        field: 'name',
        message: 'Protocol name is required',
        severity: 'error'
      });
    }
    
    if (!protocol.version) {
      errors.push({
        field: 'version',
        message: 'Protocol version is required',
        severity: 'error'
      });
    }
    
    // Check for description quality
    if (!protocol.description) {
      warnings.push({
        field: 'description',
        message: 'Protocol should have a description',
        severity: 'warning'
      });
    } else if (protocol.description.length < 30) {
      suggestions.push({
        field: 'description',
        message: 'Description is quite short',
        suggestion: 'Consider providing a more detailed description for better understanding'
      });
    }
    
    // Check for parameters
    if (protocol.parameters.length === 0) {
      warnings.push({
        field: 'parameters',
        message: 'Protocol has no parameters defined',
        severity: 'warning'
      });
    } else {
      // Validate each parameter
      protocol.parameters.forEach((param, index) => {
        if (!param.name) {
          errors.push({
            field: `parameters[${index}].name`,
            message: 'Parameter name is required',
            severity: 'error'
          });
        }
        
        if (!param.type) {
          errors.push({
            field: `parameters[${index}].type`,
            message: 'Parameter type is required',
            severity: 'error'
          });
        }
        
        if (!param.description) {
          warnings.push({
            field: `parameters[${index}].description`,
            message: 'Parameter should have a description',
            severity: 'warning'
          });
        }
      });
    }
    
    // Check for capabilities
    if (protocol.capabilities.length === 0) {
      warnings.push({
        field: 'capabilities',
        message: 'Protocol has no capabilities defined',
        severity: 'warning'
      });
    }
    
    // Check for limitations
    if (protocol.limitations.length === 0) {
      suggestions.push({
        field: 'limitations',
        message: 'No limitations are defined',
        suggestion: 'Consider defining limitations to set clear expectations'
      });
    }
    
    // Check for examples
    if (protocol.examples.length === 0) {
      warnings.push({
        field: 'examples',
        message: 'Protocol has no examples defined',
        severity: 'warning'
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
  
  /**
   * Saves a protocol to disk
   */
  private async saveProtocol(protocol: MCPProtocol): Promise<void> {
    const validation = this.validateProtocol(protocol);
    
    if (!validation.isValid) {
      throw new Error(`Protocol validation failed: ${validation.errors.map((e: ValidationError) => e.message).join(', ')}`);
    }
    
    const filePath = path.join(this.protocolsDir, `${protocol.id}.json`);
    
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(protocol, null, 2), 'utf-8');
      this.protocolsCache.set(protocol.id, protocol);
    } catch (err) {
      console.error(`Error saving protocol ${protocol.id}:`, err);
      throw err;
    }
  }
  
  /**
   * Creates the protocols directory if it doesn't exist
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  
  /**
   * Exports a protocol to a file
   */
  public async exportProtocol(id: string, exportPath: string): Promise<void> {
    const protocol = await this.getProtocol(id);
    
    if (!protocol) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    
    try {
      await fs.promises.writeFile(exportPath, JSON.stringify(protocol, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error exporting protocol ${id}:`, err);
      throw err;
    }
  }
  
  /**
   * Imports a protocol from a file
   */
  public async importProtocol(filePath: string): Promise<MCPProtocol> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const protocol = JSON.parse(content) as MCPProtocol;
      
      const validation = this.validateProtocol(protocol);
      
      if (!validation.isValid) {
        throw new Error(`Imported protocol validation failed: ${validation.errors.map((e: ValidationError) => e.message).join(', ')}`);
      }
      
      // Update timestamps
      protocol.updatedAt = new Date().toISOString();
      
      await this.saveProtocol(protocol);
      return protocol;
    } catch (err) {
      console.error(`Error importing protocol from ${filePath}:`, err);
      throw err;
    }
  }
} 