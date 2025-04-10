/**
 * Represents an AI agent with specific capabilities and configurations
 */
export interface Agent {
  id: string
  name: string
  description: string
  capabilities: string[]
  model: string
  parameters?: Record<string, any>
  status: AgentStatus
  createdAt: Date
  updatedAt: Date
}

/**
 * Status of an agent
 */
export enum AgentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CONFIGURING = 'configuring',
  ERROR = 'error'
}

/**
 * Configuration for creating a new agent
 */
export interface AgentConfig {
  name: string
  description: string
  capabilities: string[]
  model: string
  parameters?: Record<string, any>
}

/**
 * Response from agent operations
 */
export interface AgentResponse {
  success: boolean
  message: string
  data?: Agent | Agent[]
  error?: string
}
