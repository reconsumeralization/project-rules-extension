import { z } from 'zod'

/**
 * Notepad Model
 * 
 * Represents a collection of thoughts, rules, and documentation that can be:
 * - Shared between different parts of the development environment
 * - Referenced using the @ syntax
 * - Enhanced with file attachments
 * - Used as dynamic templates for various development scenarios
 */

// Schema for notepad validation
export const notepadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""),
  tags: z.array(z.string()).default([]),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    url: z.string().url(),
    size: z.number().positive()
  })).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
  isTemplate: z.boolean().default(false),
  references: z.array(z.string()).default([])
})

// Type definition derived from schema
export type Notepad = z.infer<typeof notepadSchema>

// Function to create a new notepad
export function createNotepad({ 
  title, 
  content = "", 
  tags = [], 
  isTemplate = false 
}: { 
  title: string, 
  content?: string, 
  tags?: string[], 
  isTemplate?: boolean 
}): Omit<Notepad, "id" | "createdAt" | "updatedAt" | "attachments" | "references"> {
  return {
    title,
    content,
    tags,
    isTemplate
  }
}
