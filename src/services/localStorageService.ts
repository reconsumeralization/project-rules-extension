import * as vscode from 'vscode'
import * as path from 'path'
import { Rule, createRuleFromFileContent } from '../models/rule'

const RULE_EXTENSION = '.mdc'
const WORKSPACE_RULES_DIR_NAME = '.cursor/rules'
const STORAGE_RULES_DIR_NAME = 'rules'

// --- Helper Functions ---

function getWorkspaceRulesDir(
  workspaceFolder: vscode.WorkspaceFolder,
): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolder.uri, WORKSPACE_RULES_DIR_NAME)
}

function getStorageRulesDir(context: vscode.ExtensionContext): vscode.Uri {
  // Use globalStorageUri which is recommended over globalStoragePath
  return vscode.Uri.joinPath(context.globalStorageUri, STORAGE_RULES_DIR_NAME)
}

async function ensureDirectoryExists(dirUri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(dirUri)
    // console.log(`Directory exists: ${dirUri.fsPath}`) // Optional: verbose logging
    return true
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      try {
        await vscode.workspace.fs.createDirectory(dirUri)
        console.log(`LocalStorageService: Created directory: ${dirUri.fsPath}`)
        return true
      } catch (createError) {
        console.error(`LocalStorageService: Failed to create directory ${dirUri.fsPath}:`, createError)
        vscode.window.showErrorMessage(`Failed to create rules directory at ${dirUri.fsPath}. Please check permissions.`)
        return false
      }
    } else {
      console.error(`LocalStorageService: Failed to stat directory ${dirUri.fsPath}:`, error)
      vscode.window.showErrorMessage(`Failed to access rules directory at ${dirUri.fsPath}. Please check permissions.`)
      return false
    }
  }
}

/**
 * Reads the content of a file URI.
 * Exported for use elsewhere (e.g., ruleController).
 * @param fileUri The URI of the file to read.
 * @returns The file content as a string, or undefined if read fails.
 */
export async function readFileContent(fileUri: vscode.Uri): Promise<string | undefined> {
  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri)
    return Buffer.from(fileData).toString('utf8')
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
       console.error(`LocalStorageService: Failed to read file ${fileUri.fsPath}:`, error)
       // Don't show error message for reads, might be expected (e.g., during delete)
    } else {
         // console.log(`LocalStorageService: File not found during read: ${fileUri.fsPath}`) // Optional logging
    }
    return undefined
  }
}

async function findRuleFiles(dirUri: vscode.Uri): Promise<vscode.Uri[]> {
  const ruleFiles: vscode.Uri[] = []
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri)
    for (const [name, type] of entries) {
      if (
        type === vscode.FileType.File &&
        name.toLowerCase().endsWith(RULE_EXTENSION)
      ) {
        ruleFiles.push(vscode.Uri.joinPath(dirUri, name))
      }
    }
  } catch (error) {
     // It's okay if the directory doesn't exist, return empty array
     if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
         console.error(`Failed to read directory ${dirUri.fsPath}:`, error)
     }
  }
  return ruleFiles
}

async function loadRulesFromDirectory(
  dirUri: vscode.Uri,
  defaultSyncStatus: 'local-only' | 'server-only',
): Promise<Rule[]> {
  const rules: Rule[] = []
  const ruleFileUris = await findRuleFiles(dirUri)
  // console.log(`LocalStorageService: Found ${ruleFileUris.length} potential rules in ${dirUri.fsPath}`) // Optional logging

  for (const fileUri of ruleFileUris) {
    const content = await readFileContent(fileUri)
    if (content === undefined) {continue} // Skip if read failed

    const filename = path.basename(fileUri.fsPath)
    // Simple check for invalid filenames (e.g., empty name before extension)
    if (!path.basename(filename, RULE_EXTENSION)) {
        console.warn(`LocalStorageService: Skipping file with invalid rule name: ${filename}`)
        continue
    }
    const ruleId = path.basename(filename, RULE_EXTENSION)

    try {
       const stats = await vscode.workspace.fs.stat(fileUri)
       const rule = createRuleFromFileContent({
         id: ruleId, filename, content,
         lastModified: stats.mtime, // Use actual file modification time
         syncStatus: defaultSyncStatus,
       })
       rules.push(rule)
    } catch(statError) {
       console.warn(`LocalStorageService: Failed to get stats for file ${fileUri.fsPath}, using current time:`, statError)
       // Fallback: create rule without accurate lastModified
        const rule = createRuleFromFileContent({
         id: ruleId, filename, content,
         syncStatus: defaultSyncStatus, // timestamp defaults to Date.now()
       })
       rules.push(rule)
    }
  }
  return rules
}

function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  // Prefer the first workspace folder if available
  return vscode.workspace.workspaceFolders?.[0]
}

// --- Exported Service Functions ---

export async function loadRules(context: vscode.ExtensionContext): Promise<Rule[]> {
  console.log('LocalStorageService: Loading rules...')
  const loadedRules = new Map<string, Rule>()
  let storageRuleCount = 0
  let workspaceRuleCount = 0

  // 1. Load from Extension Storage
  const storageRulesDir = getStorageRulesDir(context)
  if (await ensureDirectoryExists(storageRulesDir)) {
      const storageRules = await loadRulesFromDirectory(storageRulesDir, 'server-only')
      storageRules.forEach(rule => loadedRules.set(rule.metadata.id, rule))
      storageRuleCount = storageRules.length
  }

  // 2. Load from Workspace
  const workspaceFolder = getPrimaryWorkspaceFolder()
  if (workspaceFolder) {
    const workspaceRulesDir = getWorkspaceRulesDir(workspaceFolder)
     if (await ensureDirectoryExists(workspaceRulesDir)) {
         const workspaceRules = await loadRulesFromDirectory(workspaceRulesDir, 'local-only')
         workspaceRules.forEach(rule => loadedRules.set(rule.metadata.id, rule)) // Overwrites storage version
         workspaceRuleCount = workspaceRules.length
     }
  }
  const finalCount = loadedRules.size
  console.log(`LocalStorageService: Loaded rules. Storage: ${storageRuleCount}, Workspace: ${workspaceRuleCount}, Final unique count: ${finalCount}.`)
  return Array.from(loadedRules.values())
}

export async function saveRule(
  context: vscode.ExtensionContext,
  rule: Rule,
): Promise<{uri: vscode.Uri, syncStatus: Rule['metadata']['syncStatus'] } | undefined> {
  let targetDir: vscode.Uri
  let syncStatus: Rule['metadata']['syncStatus']
  const workspaceFolder = getPrimaryWorkspaceFolder()

  if (workspaceFolder) {
    targetDir = getWorkspaceRulesDir(workspaceFolder)
    syncStatus = 'local-only'
  } else {
    targetDir = getStorageRulesDir(context)
    // If saving to global storage, it's likely synced or generated from server
    // Keep existing status if not 'local-only', otherwise assume 'server-only'
    syncStatus = rule.metadata.syncStatus === 'local-only' ? 'server-only' : rule.metadata.syncStatus
  }

  if (!(await ensureDirectoryExists(targetDir))) {
      // Error message shown by ensureDirectoryExists
      return undefined
  }

  const targetUri = vscode.Uri.joinPath(targetDir, rule.metadata.filename)

  try {
    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(rule.content, 'utf8'),
    )
    console.log(`LocalStorageService: Saved rule to: ${targetUri.fsPath} with status ${syncStatus}`)
    return { uri: targetUri, syncStatus }
  } catch (error) {
    console.error(`LocalStorageService: Failed to write rule file ${targetUri.fsPath}:`, error)
     const message = error instanceof Error ? error.message : String(error);
     vscode.window.showErrorMessage(`Failed to save rule \"${rule.metadata.filename}\": ${message}`);
    return undefined
  }
}

/**
 * Attempts to find the URI for a given rule filename.
 * Checks workspace first, then extension storage.
 */
export async function getRuleUri(
  context: vscode.ExtensionContext,
  filename: string,
): Promise<vscode.Uri | undefined> {
    // 1. Check Workspace
    const workspaceFolder = getPrimaryWorkspaceFolder()
    if (workspaceFolder) {
        const workspaceUri = vscode.Uri.joinPath(getWorkspaceRulesDir(workspaceFolder), filename)
        try {
            await vscode.workspace.fs.stat(workspaceUri)
            return workspaceUri // Found in workspace
        } catch {
            // Not found in workspace, continue checking storage
        }
    }

    // 2. Check Extension Storage
    const storageUri = vscode.Uri.joinPath(getStorageRulesDir(context), filename)
    try {
        await vscode.workspace.fs.stat(storageUri)
        return storageUri // Found in storage
    } catch {
        // Not found anywhere
        return undefined
    }
}


export async function readRuleContentByFilename(
    context: vscode.ExtensionContext,
    filename: string
): Promise<string | undefined> {
    const uri = await getRuleUri(context, filename)
    if (!uri) {return undefined}
    return readFileContent(uri)
}


export async function deleteRule(
  context: vscode.ExtensionContext,
  filename: string,
): Promise<boolean> {
  const uriToDelete = await getRuleUri(context, filename)

  if (!uriToDelete) {
    console.warn(`LocalStorageService: Attempted to delete rule \"${filename}\", but it was not found.`)
    return false // Indicate file was not found/deleted
  }

  try {
    await vscode.workspace.fs.delete(uriToDelete, { recursive: false })
    console.log(`LocalStorageService: Deleted rule file: ${uriToDelete.fsPath}`)
    return true
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        console.warn(`LocalStorageService: File to delete was already gone: ${uriToDelete.fsPath}`)
        return false // File didn't exist to be deleted
    } else {
        console.error(`LocalStorageService: Failed to delete rule file ${uriToDelete.fsPath}:`, error)
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to delete rule \"${filename}\": ${message}`);
        return false
    }
  }
}

/**
 * Checks if a given URI points to a file within either the workspace's
 * .cursor/rules directory or the extension's global storage rules directory.
 */
export function isUriInManagedRuleDirectory(context: vscode.ExtensionContext, uri: vscode.Uri): boolean {
    const fsPath = uri.fsPath

    // Check global storage
    const storageRulesDirUri = getStorageRulesDir(context) // Use internal helper
    if (fsPath.startsWith(storageRulesDirUri.fsPath + path.sep)) {
         return true
    }

    // Check workspace storage
    const workspaceFolder = getPrimaryWorkspaceFolder()
    if (workspaceFolder) {
        const workspaceRulesDirUri = getWorkspaceRulesDir(workspaceFolder) // Use internal helper
        if (fsPath.startsWith(workspaceRulesDirUri.fsPath + path.sep)) {
            return true
        }
    }

    return false
}

export function initialize(context: vscode.ExtensionContext) {
  throw new Error('Function not implemented.')
}

export function getRulesStoragePath(context: vscode.ExtensionContext) {
  throw new Error('Function not implemented.')
}
