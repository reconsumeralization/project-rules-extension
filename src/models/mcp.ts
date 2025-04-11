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
  parameters: Record<string, unknown>
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
  usageExamples: Record<string, unknown>
  trainingData: Record<string, unknown>
  performance: Record<string, unknown>
  ethics: Record<string, unknown>
  id: string
  name: string
  description: string
  version: string
  author: string
  modelType: string
  createdAt: string
  updatedAt: string
  parameters: MCPParameter[]
  capabilities: MCPCapability[]
  limitations: MCPLimitation[]
  performanceMetrics: MCPPerformanceMetric[]
  examples: MCPExample[]
  validated: boolean
  validationErrors: ValidationError[]
  lastValidation: string | null
  ethicalConsiderations?: string
  usagePolicies?: string
  targetAudience?: string
  trainingMethodology?: string
  feedbackMechanism?: string
  versionHistory?: string[]
  customFields?: Record<string, unknown>
}

export interface MCPParameter {
  id: string
  name: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  defaultValue?: unknown
  allowedValues?: unknown[]
  minValue?: number
  maxValue?: number
  pattern?: string
  format?: string
  exampleValue?: unknown
}

export interface MCPCapability {
  id: string
  name: string
  description: string
  category?: string
  examples?: string[]
  confidenceLevel?: 'low' | 'medium' | 'high'
}

export interface MCPLimitation {
  id: string
  name: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  mitigationStrategy?: string
  examples?: string[]
}

export interface MCPPerformanceMetric {
  id: string
  name: string
  description: string
  value: number | string
  unit?: string
  benchmarkName?: string
  benchmarkValue?: number | string
  dateEvaluated?: string
  evaluationMethodology?: string
}

export interface MCPExample {
  id: string
  name: string
  description: string
  input: string
  output: string
  notes?: string
}

export interface ValidationError {
  field: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export interface AgentConfig {
  id: string
  name: string
  description: string
  created: string
  updated: string
  protocolIds: string[]
  state: 'active' | 'paused' | 'inactive'
  role: string
  capabilities: string[]
  autonomyLevel: number
  scheduledCycles: {
    enabled: boolean
    interval: number
    lastRun?: string
    nextRun?: string
  }
  operationalBoundaries: {
    maxResourceUsage: {
      memory: number
      cpu: number
    }
    timeoutThreshold: number
  }
  settings: Record<string, unknown>
}

export interface AgentStatistics {
  id: string
  agentName: string
  period: {
    from: string
    to: string
  }
  processingTime: {
    average: number
    max: number
    min: number
  }
  resourceUsage: {
    memory: number
    cpu: number
  }
  quality: {
    suggestionCount: number
    acceptanceRate: number
    rejectionRate: number
    userModifications: number
  }
  productivity: {
    tasksCompleted: number
    rulesGenerated: number
    improvementsSuggested: number
  }
  logs: AgentLogEntry[]
}

export interface AgentLogEntry {
  timestamp: string
  action: string
  details: string
  status: 'success' | 'warning' | 'error'
  duration?: number
  resourceUsage?: {
    memory: number
    cpu: number
  }
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
    description: params.description || '',
    version: params.version || '1.0.0',
    author: params.author || '',
    createdAt: params.createdAt || now.toISOString(),
    updatedAt: params.updatedAt || now.toISOString(),
    modelType: params.modelType || '',
    capabilities: params.capabilities || [],
    limitations: params.limitations || [],
    parameters: params.parameters || [],
    trainingData: params.trainingData || {},
    performanceMetrics: params.performanceMetrics || [],
    ethicalConsiderations: params.ethicalConsiderations,
    examples: params.examples || [],
    validated: params.validated || false,
    validationErrors: params.validationErrors || [],
    lastValidation: params.lastValidation || null,
    usageExamples: params.usageExamples || {},
    performance: params.performance || {},
    ethics: params.ethics || {}
  }
}

/**
 * Creates an empty MCP Protocol with default values
 */
export function createEmptyProtocol(): MCPProtocol {
  const now = new Date().toISOString()
  
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    version: '1.0.0',
    author: '',
    createdAt: now,
    updatedAt: now,
    modelType: '',
    capabilities: [],
    limitations: [],
    parameters: [],
    performanceMetrics: [],
    examples: [],
    validated: false,
    validationErrors: [],
    lastValidation: null,
    usageExamples: {},
    trainingData: {},
    performance: {},
    ethics: {}
  }
}

/**
 * Creates an empty agent configuration with default values
 */
export function createEmptyAgentConfig(): AgentConfig {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name: 'New Agent',
    description: '',
    created: now,
    updated: now,
    protocolIds: [],
    state: 'inactive',
    role: 'Assistant',
    capabilities: [],
    autonomyLevel: 3,
    scheduledCycles: {
      enabled: false,
      interval: 60
    },
    operationalBoundaries: {
      maxResourceUsage: {
        memory: 512,
        cpu: 50
      },
      timeoutThreshold: 30000
    },
    settings: {}
  }
}

/**
 * Creates empty agent statistics with default values
 */
export function createEmptyAgentStatistics(agentId: string, agentName: string = 'Unknown Agent'): AgentStatistics {
  const now = new Date().toISOString()
  return {
    id: agentId,
    agentName,
    period: {
      from: now,
      to: now
    },
    processingTime: {
      average: 0,
      max: 0,
      min: 0
    },
    resourceUsage: {
      memory: 0,
      cpu: 0
    },
    quality: {
      suggestionCount: 0,
      acceptanceRate: 0,
      rejectionRate: 0,
      userModifications: 0
    },
    productivity: {
      tasksCompleted: 0,
      rulesGenerated: 0,
      improvementsSuggested: 0
    },
    logs: []
  }
}

/**
 * Create parameter with default values
 */
export function createParameter(overrides: Partial<MCPParameter> = {}): MCPParameter {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: '',
    description: '',
    type: 'string',
    required: false,
    ...overrides
  }
}

/**
 * Create capability with default values
 */
export function createCapability(overrides: Partial<MCPCapability> = {}): MCPCapability {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: '',
    description: '',
    ...overrides
  }
}

/**
 * Create limitation with default values
 */
export function createLimitation(overrides: Partial<MCPLimitation> = {}): MCPLimitation {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: '',
    description: '',
    severity: 'medium',
    ...overrides
  }
}

/**
 * Create performance metric with default values
 */
export function createPerformanceMetric(overrides: Partial<MCPPerformanceMetric> = {}): MCPPerformanceMetric {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: '',
    description: '',
    value: '',
    ...overrides
  }
}

/**
 * Create example with default values
 */
export function createExample(overrides: Partial<MCPExample> = {}): MCPExample {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: '',
    description: '',
    input: '',
    output: '',
    ...overrides
  }
}
