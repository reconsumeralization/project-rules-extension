import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns Returns the new debounced function.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null; // Clear timeoutId after execution
    }, wait);
  };
}

/**
 * Generates a random nonce string for Content Security Policy.
 * @returns A random nonce string.
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Gets the base filename without extension.
 */
export function getBaseFilename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Gathers a basic summary of the project context.
 * Reads root directories and dependencies/devDependencies from the root package.json.
 * @returns An object containing project structure and dependency information, or null if no workspace.
 */
export async function getProjectContextSummary(): Promise<{
    rootDirs?: string[];
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
} | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return null; // No workspace open
    }
    const workspaceUri = workspaceFolder.uri;
    let summary: { 
        rootDirs?: string[], 
        dependencies?: { [key: string]: string },
        devDependencies?: { [key: string]: string }
    } = {}; 

    // 1. Get Root Directories
    try {
        const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
        summary.rootDirs = entries
            .filter(([name, type]) => type === vscode.FileType.Directory && !name.startsWith('.') && name !== 'node_modules')
            .map(([name]) => name);
    } catch (error) {
        console.warn('Utils: Failed to read workspace root directories:', error);
    }

    // 2. Get Dependencies from package.json
    try {
        const packageJsonUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
        const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJson = JSON.parse(Buffer.from(packageJsonContent).toString('utf-8'));
        
        if (typeof packageJson.dependencies === 'object' && packageJson.dependencies !== null) {
            summary.dependencies = packageJson.dependencies;
        }
        if (typeof packageJson.devDependencies === 'object' && packageJson.devDependencies !== null) {
            summary.devDependencies = packageJson.devDependencies;
        }
    } catch (error) {
        // Don't log error if package.json just doesn't exist
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
             console.warn('Utils: Failed to read or parse package.json:', error);
        }
    }

    return summary;
}

/**
 * Extracts referenced file paths denoted by `@file` prefix from text content.
 * Finds patterns like `@file path/to/your/file.ts`.
 * @param content The text content to parse.
 * @returns An array of unique file paths found.
 */
export function extractReferencedFiles(content: string): string[] {
    const paths = new Set<string>();
    // Regex to find "@file" followed by whitespace, then capture non-whitespace characters (the path)
    const regex = /@file\s+(\S+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        // match[1] contains the captured path
        paths.add(match[1]);
    }

    // Also check for lines starting with "Referenced files:" and containing @file paths
    const lines = content.split('\n');
    const refLinePrefix = 'referenced files:'; // Case-insensitive check
    for (const line of lines) {
        if (line.trim().toLowerCase().startsWith(refLinePrefix)) {
             let lineMatch;
             const lineRegex = /@file\s+(\S+)/g; // Re-apply regex specifically to this line
             while ((lineMatch = lineRegex.exec(line)) !== null) {
                paths.add(lineMatch[1]);
             }
        }
    }

    return Array.from(paths);
} 