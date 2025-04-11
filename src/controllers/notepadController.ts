import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface Notepad {
  id: string
  title: string
  content: string
  tags: string[]
  attachments: Attachment[]
  createdAt: Date
  updatedAt: Date
}

interface Attachment {
  id: string
  filename: string
  path: string
  mimeType: string
  size: number
  createdAt: Date
}

const NOTEPADS_DIR = path.join(process.cwd(), 'data', 'notepads')

/**
 * Ensures the notepads directory exists
 */
function ensureDirectoryExists() {
  if (!fs.existsSync(NOTEPADS_DIR)) {
    fs.mkdirSync(NOTEPADS_DIR, { recursive: true })
  }
}

/**
 * Creates a new notepad
 */
function createNotepad({ title, content, tags = [] }: { title: string, content: string, tags?: string[] }): Notepad {
  ensureDirectoryExists()
  
  const notepad: Notepad = {
    id: uuidv4(),
    title,
    content,
    tags,
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
  
  const notepadPath = path.join(NOTEPADS_DIR, `${notepad.id}.json`)
  fs.writeFileSync(notepadPath, JSON.stringify(notepad, null, 2))
  
  return notepad
}

/**
 * Gets a notepad by ID
 */
function getNotepad(id: string): Notepad | null {
  const notepadPath = path.join(NOTEPADS_DIR, `${id}.json`)
  
  if (!fs.existsSync(notepadPath)) return null
  
  const notepadData = fs.readFileSync(notepadPath, 'utf-8')
  return JSON.parse(notepadData) as Notepad
}

/**
 * Gets all notepads
 */
function getAllNotepads(): Notepad[] {
  ensureDirectoryExists()
  
  const files = fs.readdirSync(NOTEPADS_DIR)
    .filter(file => file.endsWith('.json'))
  
  return files.map(file => {
    const notepadData = fs.readFileSync(path.join(NOTEPADS_DIR, file), 'utf-8')
    return JSON.parse(notepadData) as Notepad
  })
}

/**
 * Updates a notepad
 */
function updateNotepad(id: string, updates: Partial<Omit<Notepad, 'id' | 'createdAt' | 'updatedAt'>>): Notepad | null {
  const notepad = getNotepad(id)
  if (!notepad) return null
  
  const updatedNotepad: Notepad = {
    ...notepad,
    ...updates,
    updatedAt: new Date()
  }
  
  const notepadPath = path.join(NOTEPADS_DIR, `${id}.json`)
  fs.writeFileSync(notepadPath, JSON.stringify(updatedNotepad, null, 2))
  
  return updatedNotepad
}

/**
 * Deletes a notepad
 */
function deleteNotepad(id: string): boolean {
  const notepadPath = path.join(NOTEPADS_DIR, `${id}.json`)
  
  if (!fs.existsSync(notepadPath)) return false
  
  fs.unlinkSync(notepadPath)
  return true
}

/**
 * Adds an attachment to a notepad
 */
function addAttachment(notepadId: string, file: { filename: string, path: string, mimeType: string, size: number }): Notepad | null {
  const notepad = getNotepad(notepadId)
  if (!notepad) return null
  
  const attachment: Attachment = {
    id: uuidv4(),
    filename: file.filename,
    path: file.path,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: new Date()
  }
  
  notepad.attachments.push(attachment)
  notepad.updatedAt = new Date()
  
  const notepadPath = path.join(NOTEPADS_DIR, `${notepadId}.json`)
  fs.writeFileSync(notepadPath, JSON.stringify(notepad, null, 2))
  
  return notepad
}

/**
 * Removes an attachment from a notepad
 */
function removeAttachment(notepadId: string, attachmentId: string): Notepad | null {
  const notepad = getNotepad(notepadId)
  if (!notepad) return null
  
  const attachmentIndex = notepad.attachments.findIndex(a => a.id === attachmentId)
  if (attachmentIndex === -1) return notepad
  
  notepad.attachments.splice(attachmentIndex, 1)
  notepad.updatedAt = new Date()
  
  const notepadPath = path.join(NOTEPADS_DIR, `${notepadId}.json`)
  fs.writeFileSync(notepadPath, JSON.stringify(notepad, null, 2))
  
  return notepad
}

/**
 * Searches notepads by title, content, or tags
 */
function searchNotepads(query: string): Notepad[] {
  const notepads = getAllNotepads()
  const lowerQuery = query.toLowerCase()
  
  return notepads.filter(notepad => 
    notepad.title.toLowerCase().includes(lowerQuery) ||
    notepad.content.toLowerCase().includes(lowerQuery) ||
    notepad.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

export {
  createNotepad,
  getNotepad,
  getAllNotepads,
  updateNotepad,
  deleteNotepad,
  addAttachment,
  removeAttachment,
  searchNotepads,
  type Notepad,
  type Attachment
}
