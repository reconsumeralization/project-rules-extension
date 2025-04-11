import { z } from 'zod'
import * as vscode from 'vscode'
import { NotepadService } from './notepadService'
import { ServerService } from './serverService'
import { getProjectContextSummary } from '../utils'

/**
 * Notepad AI Service
 * 
 * Provides AI-enhanced functionality for managing notepads, which serve as collections of thoughts,
 * rules, and documentation that can be:
 * - Shared between different parts of your development environment
 * - Referenced using the @ syntax
 * - Enhanced with file attachments
 * - Used as dynamic templates for various development scenarios
 */

// Define ActionResponse type locally since we can't import it
interface ActionResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Schema definitions
export const NotepadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  tags: z.array(z.string()),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    type: z.string(),
    name: z.string(),
    url: z.string().url(),
    size: z.number()
  })),
  createdAt: z.date(),
  updatedAt: z.date(),
  isTemplate: z.boolean(),
  references: z.array(z.string())
})

export type Notepad = z.infer<typeof NotepadSchema>

// Response schemas for validation
const NotepadContentSuggestionsSchema = z.object({
  title: z.string().optional(),
  content: z.string(),
  explanation: z.string()
})

export class NotepadAIService {
  private notepadService: NotepadService
  private serverService: ServerService

  constructor(notepadService: NotepadService, serverService: ServerService) {
    this.notepadService = notepadService
    this.serverService = serverService
  }

  /**
   * Generates content for a new notepad based on a prompt
   */
  public async generateContent(prompt: string): Promise<ActionResponse<string>> {
    try {
      if (!prompt) {
        return {
          success: false,
          error: 'A prompt is required to generate content'
        }
      }

      // Get project context to improve the AI response
      const projectContext = await getProjectContextSummary()
      
      // Create the request for the AI service
      const response = await this.serverService.callAIService({
        action: 'generateNotepadContent',
        data: {
          prompt,
          projectContext
        }
      })

      if (!response || !response.success) {
        return {
          success: false,
          error: response?.error || 'Failed to generate content'
        }
      }

      return {
        success: true,
        data: response.data?.content
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate notepad content'
      }
    }
  }

  /**
   * Analyzes file references in a notepad and provides content summaries
   */
  public async analyzeReferences(notepadId: string): Promise<ActionResponse<{
    referencedFiles: Array<{ path: string; summary: string }>
  }>> {
    try {
      const notepad = this.notepadService.getNotepad(notepadId)
      if (!notepad) {
        return {
          success: false,
          error: `Notepad with ID ${notepadId} not found`
        }
      }

      if (!notepad.references || notepad.references.length === 0) {
        return {
          success: false,
          error: 'No file references found in this notepad'
        }
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (!workspaceFolder) {
        return {
          success: false,
          error: 'No workspace folder open'
        }
      }

      const referencedFiles: Array<{ path: string; summary: string }> = []

      // Process each referenced file
      for (const filePath of notepad.references) {
        try {
          const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath)
          const fileContent = await vscode.workspace.fs.readFile(uri)
          const content = Buffer.from(fileContent).toString('utf8')

          // Generate summary via AI
          const summary = await this.summarizeFileContent(filePath, content)
          referencedFiles.push({
            path: filePath,
            summary: summary.success ? summary.data || '' : 'Failed to summarize content'
          })
        } catch (err) {
          referencedFiles.push({
            path: filePath,
            summary: `Error: ${err instanceof Error ? err.message : 'Could not read file'}`
          })
        }
      }

      return {
        success: true,
        data: { referencedFiles }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze references'
      }
    }
  }

  /**
   * Suggests improvements for a notepad's content
   */
  public async suggestImprovements(notepadId: string): Promise<ActionResponse<{
    suggestions: Array<{
      title?: string
      content: string
      explanation: string
    }>
  }>> {
    try {
      const notepad = this.notepadService.getNotepad(notepadId)
      if (!notepad) {
        return {
          success: false,
          error: `Notepad with ID ${notepadId} not found`
        }
      }

      // Get project context to improve the AI response
      const projectContext = await getProjectContextSummary()
      
      // Analyze references to provide context about referenced files
      const referencesAnalysis = await this.analyzeReferences(notepadId)
      
      // Create the request for the AI service
      const response = await this.serverService.callAIService({
        action: 'suggestNotepadImprovements',
        data: {
          prompt: `Suggest improvements for notepad: ${notepad.title}`,
          projectContext,
          notepadContent: notepad.content,
          referencedFiles: referencesAnalysis.success ? referencesAnalysis.data?.referencedFiles || [] : []
        }
      })

      if (!response || !response.success) {
        return {
          success: false,
          error: response?.error || 'Failed to suggest improvements'
        }
      }

      // Validate response data
      const suggestions = Array.isArray(response.data?.suggestions) 
        ? response.data.suggestions.filter((suggestion: unknown) => {
            const result = NotepadContentSuggestionsSchema.safeParse(suggestion)
            return result.success
          })
        : []

      return {
        success: true,
        data: { suggestions }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suggest improvements'
      }
    }
  }

  /**
   * Generates a template notepad based on a specific purpose
   */
  public async generateTemplate(purpose: string): Promise<ActionResponse<Notepad>> {
    try {
      // Get project context to improve the AI response
      const projectContext = await getProjectContextSummary()
      
      // Create the request for the AI service
      const response = await this.serverService.callAIService({
        action: 'generateNotepadTemplate',
        data: {
          prompt: purpose,
          projectContext
        }
      })

      if (!response || !response.success) {
        return {
          success: false,
          error: response?.error || 'Failed to generate template'
        }
      }

      // Create the template notepad
      const notepad = await this.notepadService.createNotepad({
        title: response.data?.title || `Template: ${purpose}`,
        content: response.data?.content || '',
        tags: response.data?.tags || [purpose, 'template'],
        isTemplate: true
      })

      return {
        success: true,
        data: notepad
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate template'
      }
    }
  }

  /**
   * Summarizes file content (helper method)
   */
  private async summarizeFileContent(filePath: string, content: string): Promise<ActionResponse<string>> {
    try {
      if (content.length > 10000) {
        content = content.substring(0, 10000) + '...[truncated]'
      }

      const response = await this.serverService.callAIService({
        action: 'summarizeFileContent',
        data: {
          prompt: `Summarize file: ${filePath}`,
          projectContext: null,
          content
        }
      })

      if (!response || !response.success) {
        return {
          success: false,
          error: response?.error || 'Failed to summarize content'
        }
      }

      return {
        success: true,
        data: response.data?.summary || ''
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to summarize file content'
      }
    }
  }
}

// Service functions
export async function createNotepad({ title, content, tags = [] }: { 
  title: string
  content: string
  tags?: string[]
}): Promise<ActionResponse<Notepad>> {
  try {
    // Implementation would connect to your data store
    const notepad: Notepad = {
      id: crypto.randomUUID(),
      title,
      content,
      tags,
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isTemplate: false,
      references: []
    }
    
    return {
      success: true,
      data: notepad
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create notepad'
    }
  }
}

export async function getNotepad(id: string): Promise<ActionResponse<Notepad>> {
  try {
    // Implementation would fetch from your data store
    
    // Placeholder for demonstration
    const notepad: Notepad = {
      id,
      title: 'Example Notepad',
      content: 'This is an example notepad content',
      tags: ['example', 'documentation'],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isTemplate: false,
      references: []
    }
    
    return {
      success: true,
      data: notepad
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve notepad'
    }
  }
}

export async function updateNotepad({ 
  id, 
  title, 
  content, 
  tags 
}: { 
  id: string
  title?: string
  content?: string
  tags?: string[]
}): Promise<ActionResponse<Notepad>> {
  try {
    // Implementation would update in your data store
    
    // Placeholder for demonstration
    const notepad: Notepad = {
      id,
      title: title || 'Updated Notepad',
      content: content || 'This notepad has been updated',
      tags: tags || ['updated'],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isTemplate: false,
      references: []
    }
    
    return {
      success: true,
      data: notepad
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update notepad'
    }
  }
}

export async function deleteNotepad(id: string): Promise<ActionResponse<void>> {
  try {
    // Implementation would delete from your data store
    
    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete notepad'
    }
  }
}

export async function addAttachmentToNotepad({ 
  notepadId, 
  file 
}: { 
  notepadId: string
  file: File
}): Promise<ActionResponse<Notepad>> {
  try {
    // Implementation would handle file upload and storage
    
    // Placeholder for demonstration
    const attachment = {
      id: crypto.randomUUID(),
      type: file.type,
      name: file.name,
      url: `https://example.com/files/${file.name}`,
      size: file.size
    }
    
    // Then would fetch and update the notepad with the new attachment
    const notepad: Notepad = {
      id: notepadId,
      title: 'Notepad with Attachment',
      content: 'This notepad has an attachment',
      tags: ['attachment'],
      attachments: [attachment],
      createdAt: new Date(),
      updatedAt: new Date(),
      isTemplate: false,
      references: []
    }
    
    return {
      success: true,
      data: notepad
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add attachment'
    }
  }
}
