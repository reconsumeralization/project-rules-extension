import { MCPProtocol, ValidationError as MCPValidationError } from '../models/mcp'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Maps internal ValidationError to MCPValidationError format
 * @eslin
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
function mapToMCPValidationError(error: ValidationError): MCPValidationError {
  return {
    field: error.path,
    message: error.message,
    severity: error.severity === 'error' ? 'error' : 'warning'
  }
}

/**
 * Validates a protocol against the MCP schema requirements
 */
export function validateProtocol(protocol: MCPProtocol): ValidationResult {
  const errors: ValidationError[] = []

  // Validate required fields
  if (!protocol.id) {
    errors.push({ path: 'id', message: 'Protocol ID is required', severity: 'error' })
  }

  if (!protocol.name) {
    errors.push({ path: 'name', message: 'Protocol name is required', severity: 'error' })
  }

  if (!protocol.description) {
    errors.push({ path: 'description', message: 'Protocol description is required', severity: 'error' })
  }

  if (!protocol.version) {
    errors.push({ path: 'version', message: 'Protocol version is required', severity: 'error' })
  } else if (!/^\d+\.\d+\.\d+$/.test(protocol.version)) {
    errors.push({ path: 'version', message: 'Version must follow semantic versioning (e.g., 1.0.0)', severity: 'error' })
  }

  if (!protocol.author) {
    errors.push({ path: 'author', message: 'Author is required', severity: 'warning' })
  }

  if (!protocol.modelType) {
    errors.push({ path: 'modelType', message: 'Model type is required', severity: 'warning' })
  }

  // Validate capabilities
  if (protocol.capabilities && protocol.capabilities.length) {
    protocol.capabilities.forEach((capability, index) => {
      if (!capability.id) {
        errors.push({ 
          path: `capabilities[${index}].id`, 
          message: 'Capability ID is required', 
          severity: 'error' 
        })
      }
      
      if (!capability.name) {
        errors.push({ 
          path: `capabilities[${index}].name`, 
          message: 'Capability name is required', 
          severity: 'error' 
        })
      }
      
      if (!capability.description) {
        errors.push({ 
          path: `capabilities[${index}].description`, 
          message: 'Capability description is required', 
          severity: 'warning' 
        })
      }
    })
  }

  // Validate limitations
  if (protocol.limitations && protocol.limitations.length) {
    protocol.limitations.forEach((limitation, index) => {
      if (!limitation.id) {
        errors.push({ 
          path: `limitations[${index}].id`, 
          message: 'Limitation ID is required', 
          severity: 'error' 
        })
      }
      
      if (!limitation.description) {
        errors.push({ 
          path: `limitations[${index}].description`, 
          message: 'Limitation description is required', 
          severity: 'error' 
        })
      }
    })
  }

  // Validate parameters
  if (protocol.parameters && protocol.parameters.length > 0) {
    protocol.parameters.forEach((param, index) => {
      if (!param.name) {
        errors.push({ 
          path: `parameters[${index}].name`, 
          message: 'Parameter name is required', 
          severity: 'error' 
        })
      }
      
      if (!param.description) {
        errors.push({ 
          path: `parameters[${index}].description`, 
          message: 'Parameter description is required', 
          severity: 'warning' 
        })
      }
    })
  }

  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors
  }
}

/**
 * Get suggested improvements for a protocol
 */
export function getSuggestedImprovements(protocol: MCPProtocol): string[] {
  const suggestions: string[] = []

  // Suggest improvements for description
  if (protocol.description && protocol.description.length < 50) {
    suggestions.push('Consider providing a more detailed description of the protocol.')
  }

  // Suggest adding capabilities
  if (!protocol.capabilities || protocol.capabilities.length === 0) {
    suggestions.push('Add capabilities to describe what the model can do.')
  }

  // Suggest adding limitations
  if (!protocol.limitations || protocol.limitations.length === 0) {
    suggestions.push('Add limitations to describe constraints of the model.')
  }

  // Suggest adding usage examples
  if (!protocol.usageExamples || Object.keys(protocol.usageExamples).length === 0) {
    suggestions.push('Add usage examples to demonstrate how to use the model.')
  }

  // Suggest adding training data information
  if (!protocol.trainingData || Object.keys(protocol.trainingData).length === 0) {
    suggestions.push('Add information about the training data used for the model.')
  }

  // Suggest adding performance metrics
  if (!protocol.performance || Object.keys(protocol.performance).length === 0) {
    suggestions.push('Add performance metrics to quantify model capabilities.')
  }

  // Suggest adding ethical considerations
  if (!protocol.ethics || Object.keys(protocol.ethics).length === 0) {
    suggestions.push('Add ethical considerations related to model usage.')
  }

  return suggestions
} 