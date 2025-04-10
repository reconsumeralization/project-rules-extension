/**
 * Model Context Protocol (MCP) interfaces and types
 * Defines the structure for AI model context protocols
 */

import { v4 as uuidv4 } from 'uuid'

export interface MCPAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  parameters: Record<string, any>
  createdAt: Date
  updatedAt: Date
  isActive: boolean
}

export interface MCPServerConfig {
  url: string
  apiKey?: string
  isConnected: boolean
  lastSyncTime?: Date
}

export interface MCPProtocol {
  id: string
  name: string
  version: string
  description: string
  modelParameters: Record<string, any>
  trainingData: {
    sources: string[]
    limitations: string[]
  }
  useCases: string[]
  performanceMetrics: Record<string, number>
  limitations: string[]
  integrationRequirements: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Creates a new MCP Agent with default values
 */
export function createMCPAgent(params: Partial<MCPAgent> = {}): MCPAgent {
  const now = new Date()
  
  return {
    id: params.id || uuidv4(),
    name: params.name || 'New Agent',
    description: params.description || '',
    capabilities: params.capabilities || [],
    parameters: params.parameters || {},
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now,
    isActive: params.isActive !== undefined ? params.isActive : true
  }
}

/**
 * Creates a new MCP Protocol with default values
 */
export function createMCPProtocol(params: Partial<MCPProtocol> = {}): MCPProtocol {
  const now = new Date()
  
  return {
    id: params.id || uuidv4(),
    name: params.name || 'New Protocol',
    version: params.version || '1.0.0',
    description: params.description || '',
    modelParameters: params.modelParameters || {},
    trainingData: params.trainingData || {
      sources: [],
      limitations: []
    },
    useCases: params.useCases || [],
    performanceMetrics: params.performanceMetrics || {},
    limitations: params.limitations || [],
    integrationRequirements: params.integrationRequirements || [],
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now
  }
}
