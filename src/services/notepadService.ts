import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Notepad, notepadSchema } from '../models/notepad'
import { v4 as uuidv4 } from 'uuid'
import { extractReferencedFiles } from '../utils'

const NOTEPAD_DIR_NAME = 'notepads'

/**
 * Service for managing notepads
 */
export class NotepadService {
  private notepads: Map<string, Notepad> = new Map()
  private notepadsDirectory: string
  private _onNotepadsChanged = new vscode.EventEmitter<void>()
  readonly onNotepadsChanged = this._onNotepadsChanged.event

  constructor(storageUri: vscode.Uri) {
    // Define directory paths for storing notepad data
    this.notepadsDirectory = path.join(storageUri.fsPath, NOTEPAD_DIR_NAME)

    // Ensure directories exist
    if (!fs.existsSync(this.notepadsDirectory)) {
      fs.mkdirSync(this.notepadsDirectory, { recursive: true })
    }

    // Load existing notepads
    this.loadNotepads()
  }

  /**
   * Loads all notepads from the storage directory
   */
  private async loadNotepads() {
    try {
      const files = await fs.promises.readdir(this.notepadsDirectory)
      const notepadFiles = files.filter(file => file.endsWith('.json'))
      
      for (const file of notepadFiles) {
        try {
          const content = await fs.promises.readFile(path.join(this.notepadsDirectory, file), 'utf-8')
          const data = JSON.parse(content)
          
          // Convert string dates to Date objects
          if (data.createdAt) data.createdAt = new Date(data.createdAt)
          if (data.updatedAt) data.updatedAt = new Date(data.updatedAt)
          
          // Validate the notepad data
          const result = notepadSchema.safeParse(data)
          if (result.success) {
            this.notepads.set(result.data.id, result.data)
          } else {
            console.warn(`Invalid notepad data in ${file}:`, result.error)
          }
        } catch (err) {
          console.error(`Error loading notepad file ${file}:`, err)
        }
      }
    } catch (err) {
      console.error('Error loading notepads:', err)
    }
  }

  /**
   * Returns all notepads
   */
  public getNotepads(): Notepad[] {
    return Array.from(this.notepads.values())
  }

  /**
   * Returns notepads that are templates
   */
  public getTemplates(): Notepad[] {
    return Array.from(this.notepads.values()).filter(notepad => notepad.isTemplate)
  }

  /**
   * Returns a notepad by ID
   */
  public getNotepad(id: string): Notepad | undefined {
    return this.notepads.get(id)
  }

  /**
   * Creates a new notepad
   */
  public async createNotepad(data: {
    title: string
    content: string
    tags?: string[]
    isTemplate?: boolean
  }): Promise<Notepad> {
    const now = new Date()
    
    const notepad: Notepad = {
      id: uuidv4(),
      title: data.title,
      content: data.content || '',
      tags: data.tags || [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      isTemplate: data.isTemplate || false,
      references: extractReferencedFiles(data.content || '')
    }
    
    await this.saveNotepad(notepad)
    return notepad
  }

  /**
   * Updates an existing notepad
   */
  public async updateNotepad(id: string, updates: Partial<Omit<Notepad, 'id' | 'createdAt'>>): Promise<Notepad> {
    const notepad = this.notepads.get(id)
    if (!notepad) {
      throw new Error(`Notepad with ID ${id} not found`)
    }
    
    const updatedNotepad = {
      ...notepad,
      ...updates,
      updatedAt: new Date()
    }
    
    // Re-extract references if content was updated
    if (updates.content) {
      updatedNotepad.references = extractReferencedFiles(updates.content)
    }
    
    await this.saveNotepad(updatedNotepad)
    return updatedNotepad
  }

  /**
   * Deletes a notepad by ID
   */
  public async deleteNotepad(id: string): Promise<void> {
    const notepad = this.notepads.get(id)
    if (!notepad) {
      throw new Error(`Notepad with ID ${id} not found`)
    }
    
    const filePath = path.join(this.notepadsDirectory, `${id}.json`)
    try {
      await fs.promises.unlink(filePath)
      this.notepads.delete(id)
      this._onNotepadsChanged.fire()
    } catch (err) {
      console.error(`Error deleting notepad ${id}:`, err)
      throw err
    }
  }

  /**
   * Adds a file attachment to a notepad
   */
  public async addAttachment(notepadId: string, fileUri: vscode.Uri): Promise<Notepad> {
    const notepad = this.notepads.get(notepadId)
    if (!notepad) {
      throw new Error(`Notepad with ID ${notepadId} not found`)
    }
    
    try {
      // Read file content and stats
      const fileContent = await vscode.workspace.fs.readFile(fileUri)
      const fileStat = await vscode.workspace.fs.stat(fileUri)
      
      // Create a copy of the file in our storage directory with a unique name
      const fileName = path.basename(fileUri.fsPath)
      const uniqueFileName = `${uuidv4()}-${fileName}`
      const attachmentPath = path.join(this.notepadsDirectory, 'attachments', uniqueFileName)
      
      // Ensure attachments directory exists
      const attachmentsDir = path.join(this.notepadsDirectory, 'attachments')
      if (!fs.existsSync(attachmentsDir)) {
        fs.mkdirSync(attachmentsDir, { recursive: true })
      }
      
      // Write the file
      await fs.promises.writeFile(attachmentPath, fileContent)
      
      // Create the attachment object
      const attachment = {
        id: uuidv4(),
        name: fileName,
        type: path.extname(fileName).slice(1) || 'txt',
        url: `file://${attachmentPath}`,
        size: fileStat.size
      }
      
      // Update the notepad with the new attachment
      const updatedNotepad = {
        ...notepad,
        attachments: [...notepad.attachments, attachment],
        updatedAt: new Date()
      }
      
      await this.saveNotepad(updatedNotepad)
      return updatedNotepad
    } catch (err) {
      console.error(`Error adding attachment to notepad ${notepadId}:`, err)
      throw err
    }
  }

  /**
   * Removes an attachment from a notepad
   */
  public async removeAttachment(notepadId: string, attachmentId: string): Promise<Notepad> {
    const notepad = this.notepads.get(notepadId)
    if (!notepad) {
      throw new Error(`Notepad with ID ${notepadId} not found`)
    }
    
    const attachment = notepad.attachments.find(a => a.id === attachmentId)
    if (!attachment) {
      throw new Error(`Attachment with ID ${attachmentId} not found in notepad ${notepadId}`)
    }
    
    try {
      // Extract the file path from the URL
      const fileUrl = new URL(attachment.url)
      const filePath = fileUrl.pathname
      
      // Delete the file if it exists
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
      }
      
      // Update the notepad without the attachment
      const updatedNotepad = {
        ...notepad,
        attachments: notepad.attachments.filter(a => a.id !== attachmentId),
        updatedAt: new Date()
      }
      
      await this.saveNotepad(updatedNotepad)
      return updatedNotepad
    } catch (err) {
      console.error(`Error removing attachment ${attachmentId} from notepad ${notepadId}:`, err)
      throw err
    }
  }

  /**
   * Creates a new notepad from a template
   */
  public async createFromTemplate(templateId: string, title: string): Promise<Notepad> {
    const template = this.notepads.get(templateId)
    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`)
    }
    
    if (!template.isTemplate) {
      throw new Error(`Notepad with ID ${templateId} is not a template`)
    }
    
    return this.createNotepad({
      title,
      content: template.content,
      tags: template.tags,
      isTemplate: false
    })
  }

  /**
   * Saves a notepad to the filesystem
   */
  private async saveNotepad(notepad: Notepad): Promise<void> {
    try {
      const filePath = path.join(this.notepadsDirectory, `${notepad.id}.json`)
      
      // Update in-memory cache
      this.notepads.set(notepad.id, notepad)
      
      // Save to file
      await fs.promises.writeFile(filePath, JSON.stringify(notepad, null, 2), 'utf-8')
      
      // Notify listeners
      this._onNotepadsChanged.fire()
    } catch (err) {
      console.error(`Error saving notepad ${notepad.id}:`, err)
      throw err
    }
  }
}
