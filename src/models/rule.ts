export interface RuleMetadata {
  readonly id: string
  readonly filename: string
  description?: string
  filePatterns: string[]
  referencedFiles: string[]
  lastModified: number
  syncStatus: 'synced' | 'local-only' | 'server-only' | 'conflict'
}

export interface Rule {
  readonly metadata: RuleMetadata
  readonly content: string
}

// --- Helper Functions ---

function extractDescription(content: string): string | undefined {
  // Extract description from the first H1 markdown heading
  const match = content.match(/^#\s+(.*?)(\r?\n|$)/m)
  return match?.[1]?.trim()
}

function extractFilePatterns(content: string): string[] {
  // Extract file patterns from "Applies to:" section
  // Looks for a line starting with "Applies to:", case-insensitive, possibly with markdown emphasis
  // NOTE: This uses basic string matching. For full glob support (like `**/*.ts`),
  // a library like 'minimatch' might be needed in the future if complex patterns become common.
  const match = content.match(/^[\*_]*Applies to:[\*_]*\s*(.+?)$/im)
  if (!match?.[1]) {return []}

  return match[1]
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean) // Remove empty strings
}

function extractReferencedFiles(content: string): string[] {
  // Extract @file references (e.g., @file path/to/some/file.ts)
  // Uses a global, multiline regex to find all occurrences
  // Updated regex to capture everything until the end of the line after @file
  const matches = content.matchAll(/@file\s+(.+?)$/gm) 
  // Original: /@file\s+([^\s\r\n]+)/gm
  return Array.from(matches, (match) => match[1].trim()) // Trim potential trailing spaces
}

// --- Rule Creation ---

interface CreateRuleFromFileContentArgs {
  id: string
  filename: string
  content: string
  lastModified?: number
  syncStatus?: RuleMetadata['syncStatus']
}

/**
 * Creates a Rule object by parsing metadata from its markdown content.
 */
export function createRuleFromFileContent({
  id,
  filename,
  content,
  lastModified = Date.now(),
  syncStatus = 'local-only',
}: CreateRuleFromFileContentArgs): Rule {
  const description = extractDescription(content)
  const filePatterns = extractFilePatterns(content)
  const referencedFiles = extractReferencedFiles(content)

  const metadata: RuleMetadata = {
    id,
    filename,
    description,
    filePatterns,
    referencedFiles,
    lastModified,
    syncStatus,
  }

  return { metadata, content }
}

// --- Types for Server Communication (as defined in API contract) ---

export interface SyncOperations {
  create: Rule[];
  update: Rule[];
  delete: string[];
}

export interface SyncResult {
  created: Rule[];
  updated: Rule[];
  deleted: string[];
  conflicts: RuleConflict[];
}

export interface RuleConflict {
  id: string;
  local: Rule;
  server: Rule;
}

export interface RuleSuggestion {
  type: 'addition' | 'modification' | 'removal';
  section: string; // e.g., "Description", "Content", "File Patterns"
  content: string; // The suggested text or pattern
  explanation: string;
}

export interface RuleApplicabilityResult {
  shouldApply: boolean;
  confidence: number; // e.g., 0.0 to 1.0
  explanation: string;
}

// --- Utility Functions ---

/**
 * Generates a display string for the rule's applicability.
 */
export function getRuleAppliesToDisplay(rule: Rule): string {
  return rule.metadata.filePatterns.join(', ') || 'N/A'
} 