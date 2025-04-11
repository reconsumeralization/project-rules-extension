import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { MCPProtocol, ValidationError, createEmptyProtocol } from '../models/mcp'

/**
 * Service for managing MCP Protocols
 */
export class MCPService {
  private context: vscode.ExtensionContext
  private storagePath: string
  private protocols: MCPProtocol[] | null = null

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.storagePath = path.join(context.globalStorageUri.fsPath, 'protocols')
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true })
    }
  }

  /**
   * Get all protocols
   */
  async getProtocols(): Promise<MCPProtocol[]> {
    if (!this.protocols) {
      await this.loadProtocols()
    }
    return this.protocols || []
  }

  /**
   * Get a protocol by ID
   */
  async getProtocolById(id: string): Promise<MCPProtocol | undefined> {
    const protocols = await this.getProtocols()
    return protocols.find(p => p.id === id)
  }

  /**
   * Create a new protocol
   */
  async createProtocol(protocolData?: Partial<MCPProtocol>): Promise<MCPProtocol> {
    const newProtocol = { ...createEmptyProtocol(), ...protocolData }
    if (!this.protocols) {
      await this.loadProtocols()
    }
    
    this.protocols = [...(this.protocols || []), newProtocol]
    await this.saveProtocols()
    return newProtocol
  }

  /**
   * Update an existing protocol
   */
  async updateProtocol(id: string, updates: Partial<MCPProtocol>): Promise<MCPProtocol | undefined> {
    if (!this.protocols) {
      await this.loadProtocols()
    }
    
    const index = this.protocols?.findIndex(p => p.id === id)
    if (index === undefined || index < 0 || !this.protocols) {
      throw new Error(`Protocol with ID ${id} not found`)
    }
    
    const updatedProtocol = {
      ...this.protocols[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    this.protocols[index] = updatedProtocol
    await this.saveProtocols()
    return updatedProtocol
  }

  /**
   * Delete a protocol by ID
   */
  async deleteProtocol(id: string): Promise<boolean> {
    if (!this.protocols) {
      await this.loadProtocols()
    }
    
    const initialLength = this.protocols?.length || 0
    this.protocols = this.protocols?.filter(p => p.id !== id) || []
    
    if (initialLength !== this.protocols.length) {
      await this.saveProtocols()
      return true
    }
    
    return false
  }

  /**
   * Validate a protocol
   */
  async validateProtocol(protocol: MCPProtocol): Promise<ValidationError[]> {
    const errors: ValidationError[] = []
    
    // Required fields validation
    const requiredFields: (keyof MCPProtocol)[] = [
      'name', 'description', 'version', 'author', 'modelType'
    ]
    
    for (const field of requiredFields) {
      if (!protocol[field]) {
        errors.push({
          field,
          message: `${field} is required`,
          severity: 'error'
        })
      }
    }
    
    // Name validation
    if (protocol.name && protocol.name.length < 3) {
      errors.push({
        field: 'name',
        message: 'Name should be at least 3 characters long',
        severity: 'error'
      })
    }
    
    // Description validation
    if (protocol.description && protocol.description.length < 10) {
      errors.push({
        field: 'description',
        message: 'Description should be at least 10 characters long',
        severity: 'warning'
      })
    }
    
    // Version validation
    const versionRegex = /^\d+\.\d+\.\d+$/
    if (protocol.version && !versionRegex.test(protocol.version)) {
      errors.push({
        field: 'version',
        message: 'Version should follow semver format (e.g., 1.0.0)',
        severity: 'error'
      })
    }
    
    // Capabilities validation
    if (!protocol.capabilities || protocol.capabilities.length === 0) {
      errors.push({
        field: 'capabilities',
        message: 'At least one capability should be defined',
        severity: 'warning'
      })
    } else {
      protocol.capabilities.forEach((capability, index) => {
        if (!capability.name) {
          errors.push({
            field: `capabilities[${index}].name`,
            message: 'Capability name is required',
            severity: 'error'
          })
        }
        if (!capability.description) {
          errors.push({
            field: `capabilities[${index}].description`,
            message: 'Capability description is required',
            severity: 'error'
          })
        }
      })
    }
    
    // Limitations validation
    if (!protocol.limitations || protocol.limitations.length === 0) {
      errors.push({
        field: 'limitations',
        message: 'At least one limitation should be defined',
        severity: 'warning'
      })
    } else {
      protocol.limitations.forEach((limitation, index) => {
        if (!limitation.name) {
          errors.push({
            field: `limitations[${index}].name`,
            message: 'Limitation name is required',
            severity: 'error'
          })
        }
        if (!limitation.description) {
          errors.push({
            field: `limitations[${index}].description`,
            message: 'Limitation description is required',
            severity: 'error'
          })
        }
      })
    }
    
    // Update protocol validation status
    const hasErrors = errors.some(e => e.severity === 'error')
    await this.updateProtocol(protocol.id, {
      validated: !hasErrors,
      validationErrors: errors,
      lastValidation: new Date().toISOString()
    })
    
    return errors
  }

  /**
   * Get AI suggestions for improving a protocol
   */
  async getProtocolSuggestions(protocol: MCPProtocol): Promise<string[]> {
    // This would connect to an AI service for suggestions
    // For now, we'll return some static suggestions based on the protocol
    const suggestions: string[] = []
    
    if (!protocol.capabilities || protocol.capabilities.length < 3) {
      suggestions.push('Consider adding more capabilities to better describe what the model can do')
    }
    
    if (!protocol.limitations || protocol.limitations.length < 2) {
      suggestions.push('Add more limitations to set clear expectations about model boundaries')
    }
    
    if (!protocol.examples || protocol.examples.length < 2) {
      suggestions.push('Including more usage examples would help users understand how to use the model')
    }
    
    if (!protocol.ethicalConsiderations) {
      suggestions.push('Add ethical considerations to address responsible AI usage')
    }
    
    return suggestions
  }

  /**
   * Import a protocol from a file
   */
  async importProtocol(filePath: string): Promise<MCPProtocol> {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8')
      const protocolData = JSON.parse(fileContent)
      
      // Ensure required fields
      if (!protocolData.id) {
        protocolData.id = crypto.randomUUID()
      }
      
      const now = new Date().toISOString()
      if (!protocolData.createdAt) {
        protocolData.createdAt = now
      }
      
      protocolData.updatedAt = now
      
      // Create the protocol
      return await this.createProtocol(protocolData)
    } catch (error) {
      throw new Error(`Failed to import protocol: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Export a protocol to a file
   */
  async exportProtocol(protocol: MCPProtocol, filePath: string): Promise<void> {
    try {
      const fileContent = JSON.stringify(protocol, null, 2)
      fs.writeFileSync(filePath, fileContent, 'utf8')
    } catch (error) {
      throw new Error(`Failed to export protocol: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Load protocols from storage
   */
  private async loadProtocols(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true })
        this.protocols = []
        return
      }
      
      const files = fs.readdirSync(this.storagePath)
      const protocolFiles = files.filter(file => file.endsWith('.json'))
      
      const protocols: MCPProtocol[] = []
      for (const file of protocolFiles) {
        const filePath = path.join(this.storagePath, file)
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          const protocol = JSON.parse(content) as MCPProtocol
          protocols.push(protocol)
        } catch (error) {
          console.error(`Error loading protocol from ${filePath}:`, error)
        }
      }
      
      this.protocols = protocols
    } catch (error) {
      console.error('Error loading protocols:', error)
      this.protocols = []
    }
  }

  /**
   * Save protocols to storage
   */
  private async saveProtocols(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true })
      }
      
      // Clean directory
      const files = fs.readdirSync(this.storagePath)
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.storagePath, file))
        }
      }
      
      // Save each protocol as a separate file
      for (const protocol of this.protocols || []) {
        const filePath = path.join(this.storagePath, `${protocol.id}.json`)
        fs.writeFileSync(filePath, JSON.stringify(protocol, null, 2), 'utf8')
      }
    } catch (error) {
      console.error('Error saving protocols:', error)
      throw new Error(`Failed to save protocols: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 