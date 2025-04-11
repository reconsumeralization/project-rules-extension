import * as vscode from 'vscode'
import * as path from 'path'
import { Rule } from '../models/rule'
import * as ruleController from './ruleController'
import * as aiService from '../services/aiService'
import { ServerService } from '../services/serverService'
import { debounce, getBaseFilename, extractReferencedFiles } from '../utils'

// --- Constants ---
const CONTEXT_RULE_PREFIX = 'context-rule-'
const MAX_CONTEXT_SIZE = 100000 // Maximum characters to include in context

// --- Module State ---
let isInitialized = false
let serverServiceInstance: ServerService | null = null

// --- Context Rule Profiles ---
interface ContextProfile {
  id: string
  name: string
  description: string
  triggers: string[]
  requiredContext: string[]
  proactiveContext: string[]
  actions: string[]
}

// Define the rule profiles as specified by the user
const contextProfiles: ContextProfile[] = [
  {
    id: 'baseline',
    name: 'Baseline Context',
    description: 'Establishes the absolute minimum context for any interaction.',
    triggers: ['*'],
    requiredContext: [
      'activeFile',
      'languageId',
      'cursorPosition',
      'selection',
      'visibleCodeRange',
      'relevantDiagnostics'
    ],
    proactiveContext: [],
    actions: ['packageBaseline']
  },
  {
    id: 'debugging',
    name: 'Debugging / Fixing Errors',
    description: 'Gathers context specifically for understanding and fixing errors.',
    triggers: ['error', 'fix', 'debug', 'why fails', 'diagnostics'],
    requiredContext: [
      'errorSnippet',
      'surroundingCode',
      'localScopeDefinitions',
      'diagnosticRelatedInfo'
    ],
    proactiveContext: [
      'importedSymbolDefinitions',
      'typeRelatedInfo'
    ],
    actions: ['analyzeErrorAndFix']
  },
  {
    id: 'writing',
    name: 'Writing / Completing Code',
    description: 'Provides context for generating new code or completing existing code.',
    triggers: ['write', 'create', 'implement', 'add', 'complete', 'new', 'generate'],
    requiredContext: [
      'immediateScope',
      'availableSymbols',
      'functionSignature',
      'relevantImports'
    ],
    proactiveContext: [
      'projectConventions',
      'similarCodePatterns',
      'typeDefinitions'
    ],
    actions: ['generateCode']
  },
  {
    id: 'refactoring',
    name: 'Refactoring Code',
    description: 'Gathers context for restructuring existing code without changing its behavior.',
    triggers: ['refactor', 'improve', 'clean up', 'extract', 'rename'],
    requiredContext: [
      'selectedCodeBlock',
      'enclosingScope'
    ],
    proactiveContext: [
      'usageReferences',
      'externalDefinitions'
    ],
    actions: ['proposeRefactoring']
  },
  {
    id: 'explaining',
    name: 'Understanding / Explaining Code',
    description: 'Provides context for explaining what code does and how it works.',
    triggers: ['explain', 'what does this do', 'how works', 'understand', 'describe'],
    requiredContext: [
      'codeUnderScrutiny',
      'surroundingCode'
    ],
    proactiveContext: [
      'relevantDefinitions',
      'docstringsComments',
      'fileModulePurpose'
    ],
    actions: ['explainCode']
  },
  {
    id: 'dependencies',
    name: 'Working with Dependencies / APIs',
    description: 'Gathers context about external libraries, frameworks, and APIs.',
    triggers: ['library', 'framework', 'api', 'import', 'package.json', 'dependency'],
    requiredContext: [
      'codeSnippet',
      'projectDependencies'
    ],
    proactiveContext: [
      'typeDefinitions',
      'documentationSearch',
      'workspaceExamples'
    ],
    actions: ['explainApi']
  }
]

// --- Context Gathering Functions ---

/**
 * Gathers baseline context that's required for any interaction
 */
async function gatherBaselineContext(): Promise<any> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return { error: 'No active editor' }
  }

  const document = editor.document
  const selection = editor.selection
  const diagnostics = vscode.languages.getDiagnostics(document.uri)
  const relevantDiagnostics = diagnostics.filter(diagnostic => {
    // Filter diagnostics near the cursor or in the selection
    return (
      diagnostic.range.contains(selection.active) ||
      selection.contains(diagnostic.range) ||
      diagnostic.severity === vscode.DiagnosticSeverity.Error
    )
  })

  return {
    activeFile: document.uri.fsPath,
    languageId: document.languageId,
    cursorPosition: {
      line: selection.active.line,
      character: selection.active.character
    },
    selection: selection.isEmpty 
      ? null 
      : {
          text: document.getText(selection),
          start: { line: selection.start.line, character: selection.start.character },
          end: { line: selection.end.line, character: selection.end.character }
        },
    visibleCodeRange: {
      ranges: editor.visibleRanges.map(range => ({
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character }
      })),
      text: editor.visibleRanges.map(range => document.getText(range)).join('\n')
    },
    relevantDiagnostics: relevantDiagnostics.map(diag => ({
      message: diag.message,
      severity: diag.severity,
      code: diag.code,
      range: {
        start: { line: diag.range.start.line, character: diag.range.start.character },
        end: { line: diag.range.end.line, character: diag.range.end.character }
      },
      relatedInformation: diag.relatedInformation
        ? diag.relatedInformation.map(related => ({
            message: related.message,
            location: {
              uri: related.location.uri.toString(),
              range: {
                start: { line: related.location.range.start.line, character: related.location.range.start.character },
                end: { line: related.location.range.end.line, character: related.location.range.end.character }
              }
            }
          }))
        : []
    }))
  }
}

/**
 * Gather additional context for error diagnostics
 */
async function gatherErrorContext(baseContext: any): Promise<any> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !baseContext.relevantDiagnostics || baseContext.relevantDiagnostics.length === 0) {
    return {}
  }

  const document = editor.document
  const errorDiagnostic = baseContext.relevantDiagnostics.find(d => 
    d.severity === vscode.DiagnosticSeverity.Error
  )

  if (!errorDiagnostic) {
    return {}
  }

  // Get error snippet
  const errorRange = new vscode.Range(
    new vscode.Position(errorDiagnostic.range.start.line, errorDiagnostic.range.start.character),
    new vscode.Position(errorDiagnostic.range.end.line, errorDiagnostic.range.end.character)
  )
  const errorSnippet = document.getText(errorRange)

  // Get surrounding code (5 lines before and after)
  const startLine = Math.max(0, errorDiagnostic.range.start.line - 5)
  const endLine = Math.min(document.lineCount - 1, errorDiagnostic.range.end.line + 5)
  const surroundingRange = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, document.lineAt(endLine).text.length)
  )
  const surroundingCode = document.getText(surroundingRange)

  return {
    errorSnippet,
    surroundingCode,
    diagnosticRelatedInfo: errorDiagnostic.relatedInformation
  }
}

/**
 * Gather context for code writing/completion
 */
async function gatherWritingContext(baseContext: any): Promise<any> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return {}
  }

  const document = editor.document
  const position = editor.selection.active

  // Get the entire file content to analyze
  const fileContent = document.getText()
  
  // Find the immediate scope (function/class/block containing cursor)
  // This is a simplified approach - for a real implementation, you'd need 
  // more sophisticated parsing based on the language
  const immediateScope = getImmediateScope(fileContent, position.line, document.languageId)
  
  // Get imports from the top of the file
  const importLines = []
  for (let i = 0; i < Math.min(100, document.lineCount); i++) {
    const line = document.lineAt(i).text
    if (line.includes('import ') || line.includes('require(')) {
      importLines.push(line)
    }
    // Stop if we're past the imports section
    if (line.trim() === '' && importLines.length > 0) {
      break
    }
  }

  return {
    immediateScope,
    relevantImports: importLines.join('\n')
  }
}

/**
 * Get the immediate scope containing the cursor position
 * This is a simplified version - a real implementation would need
 * proper language-specific parsing
 */
function getImmediateScope(fileContent: string, cursorLine: number, languageId: string): string {
  const lines = fileContent.split('\n')
  let startLine = cursorLine
  let endLine = cursorLine
  let openBrackets = 0
  let closeBrackets = 0

  // Find the function/block start (going backwards)
  for (let i = cursorLine; i >= 0; i--) {
    const line = lines[i]
    openBrackets += (line.match(/{/g) || []).length
    closeBrackets += (line.match(/}/g) || []).length
    
    // For JavaScript/TypeScript, look for function or class declarations
    if ((languageId === 'javascript' || languageId === 'typescript') && 
        (line.includes('function') || line.includes('class') || line.includes('=>'))) {
      startLine = i
      break
    }
    
    // If we found a complete block, break
    if (openBrackets > closeBrackets) {
      startLine = i
      break
    }
  }

  // Reset counters
  openBrackets = 0
  closeBrackets = 0

  // Find the function/block end (going forwards)
  for (let i = cursorLine; i < lines.length; i++) {
    const line = lines[i]
    openBrackets += (line.match(/{/g) || []).length
    closeBrackets += (line.match(/}/g) || []).length
    
    if (closeBrackets > openBrackets) {
      endLine = i
      break
    }
  }

  // Return the scope
  return lines.slice(startLine, endLine + 1).join('\n')
}

/**
 * Gather context for refactoring
 */
async function gatherRefactoringContext(baseContext: any): Promise<any> {
  if (!baseContext.selection || !baseContext.selection.text) {
    return {}
  }

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return {}
  }

  const document = editor.document
  
  // The selected code block is already in baseContext.selection.text
  // Find the enclosing scope using similar logic to getImmediateScope
  const enclosingScope = getImmediateScope(
    document.getText(), 
    baseContext.selection.start.line,
    document.languageId
  )

  return {
    selectedCodeBlock: baseContext.selection.text,
    enclosingScope
  }
}

/**
 * Gather context for explaining code
 */
async function gatherExplainingContext(baseContext: any): Promise<any> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return {}
  }

  const document = editor.document
  let codeToExplain = ''

  // If we have a selection, use that
  if (baseContext.selection && baseContext.selection.text) {
    codeToExplain = baseContext.selection.text
  } else {
    // Otherwise, try to identify a meaningful block around cursor
    const cursorLine = baseContext.cursorPosition.line
    codeToExplain = getImmediateScope(document.getText(), cursorLine, document.languageId)
  }

  // Get any comments or docstrings above the code
  const comments = getCommentsAbove(document, baseContext.cursorPosition.line)

  return {
    codeUnderScrutiny: codeToExplain,
    docstringsComments: comments
  }
}

/**
 * Get comments/docstrings above a specific line
 */
function getCommentsAbove(document: vscode.TextDocument, line: number): string {
  const comments = []
  let currentLine = line - 1
  
  while (currentLine >= 0) {
    const lineText = document.lineAt(currentLine).text.trim()
    if (lineText.startsWith('//') || lineText.startsWith('/*') || lineText.startsWith('*')) {
      comments.unshift(lineText)
      currentLine--
    } else if (lineText === '') {
      // Skip empty lines
      currentLine--
    } else {
      break
    }
  }
  
  return comments.join('\n')
}

/**
 * Gather context for dependencies/APIs
 */
async function gatherDependenciesContext(baseContext: any): Promise<any> {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    return {}
  }

  // Look for package.json
  const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**')
  let dependencies = {}

  if (packageJsonFiles.length > 0) {
    try {
      const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonFiles[0])
      const packageJson = JSON.parse(packageJsonContent.toString())
      dependencies = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      }
    } catch (error) {
      console.error('Error parsing package.json:', error)
    }
  }

  return {
    projectDependencies: dependencies
  }
}

/**
 * Infer intent from user query and existing context
 */
function inferUserIntent(query: string, baseContext: any): string {
  // Default to explaining if we can't determine
  let intent = 'explaining'

  // Check for errors
  if (baseContext.relevantDiagnostics && 
      baseContext.relevantDiagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error)) {
    intent = 'debugging'
  }

  // Check query for intent keywords
  const queryLower = query.toLowerCase()
  for (const profile of contextProfiles) {
    if (profile.id === 'baseline') continue
    
    for (const trigger of profile.triggers) {
      if (queryLower.includes(trigger.toLowerCase())) {
        intent = profile.id
        break
      }
    }
  }

  return intent
}

/**
 * Gather context based on inferred intent
 */
async function gatherContextByIntent(intent: string, baseContext: any): Promise<any> {
  const contextData: any = { ...baseContext }

  switch (intent) {
    case 'debugging':
      Object.assign(contextData, await gatherErrorContext(baseContext))
      break
    case 'writing':
      Object.assign(contextData, await gatherWritingContext(baseContext))
      break
    case 'refactoring':
      Object.assign(contextData, await gatherRefactoringContext(baseContext))
      break
    case 'explaining':
      Object.assign(contextData, await gatherExplainingContext(baseContext))
      break
    case 'dependencies':
      Object.assign(contextData, await gatherDependenciesContext(baseContext))
      break
  }

  return contextData
}

/**
 * Main function to gather context for a user query
 * Returns structured context based on inferred intent
 */
export async function gatherContext(query: string): Promise<any> {
  try {
    // 1. Always gather baseline context
    const baseContext = await gatherBaselineContext()
    
    // 2. Infer user intent
    const intent = inferUserIntent(query, baseContext)
    console.log(`ContextRuleController: Inferred intent '${intent}' for query: ${query}`)
    
    // 3. Gather additional context based on intent
    const fullContext = await gatherContextByIntent(intent, baseContext)
    
    // 4. Add metadata about the context gathering process
    fullContext.contextMetadata = {
      intent,
      timestamp: new Date().toISOString(),
      profile: contextProfiles.find(p => p.id === intent)?.name || 'Unknown profile'
    }
    
    return fullContext
  } catch (error) {
    console.error('Error gathering context:', error)
    return {
      error: `Failed to gather context: ${error instanceof Error ? error.message : String(error)}`,
      baselineContextOnly: await gatherBaselineContext()
    }
  }
}

/**
 * Initializes the ContextRuleController
 */
export async function initializeContextRuleController(context: vscode.ExtensionContext): Promise<void> {
  if (isInitialized) {
    return
  }

  console.log('Initializing ContextRuleController...')
  isInitialized = true

  // Register any commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-rules.gatherContext', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('No active editor to gather context from')
        return
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Enter your query to gather context',
        placeHolder: 'e.g., explain this code, fix this error, implement feature'
      })

      if (!query) return

      const contextData = await gatherContext(query)
      // For demonstration, show what was gathered
      const contextDataPanel = vscode.window.createWebviewPanel(
        'contextData',
        'Gathered Context',
        vscode.ViewColumn.Beside,
        {}
      )
      
      contextDataPanel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Context Data</title>
          <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            pre { background-color: var(--vscode-editor-background); padding: 10px; overflow: auto; }
          </style>
        </head>
        <body>
          <h1>Gathered Context for: "${query}"</h1>
          <h2>Inferred Intent: ${contextData.contextMetadata?.intent || 'Unknown'}</h2>
          <pre>${JSON.stringify(contextData, null, 2)}</pre>
        </body>
        </html>
      `
    })
  )

  console.log('ContextRuleController initialized')
}

/**
 * Set the server service instance
 */
export function setServerService(instance: ServerService): void {
  serverServiceInstance = instance
  console.log('ContextRuleController: ServerService instance set')
}