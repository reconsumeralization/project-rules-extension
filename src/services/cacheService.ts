import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs'; // Use node fs for sync operations if needed, but prefer vscode.workspace.fs

// Interface for cache entries
interface CacheEntry<T> {
    value: T;
    timestamp: number; // When the entry was created
    ttl: number; // Time-to-live in milliseconds
}

// In-memory cache
const memoryCache = new Map<string, CacheEntry<any>>();

// --- Private Helpers ---

let diskCachePath: vscode.Uri | undefined = undefined;
let cacheDirEnsured = false;

/**
 * Initializes the disk cache path based on extension storage.
 * Should be called once during activation or first use.
 */
function initializeCachePath(context: vscode.ExtensionContext): void {
    if (!diskCachePath) {
        diskCachePath = vscode.Uri.joinPath(context.globalStorageUri, 'cache');
        console.log(`CacheService: Disk cache path set to: ${diskCachePath.fsPath}`);
        cacheDirEnsured = false; // Reset ensured flag when path is initialized
    }
}

/**
 * Ensures the disk cache directory exists.
 */
async function ensureCacheDirectoryExists(): Promise<boolean> {
    if (!diskCachePath) {
        console.error("CacheService: Disk cache path not initialized.");
        return false;
    }
    if (cacheDirEnsured) return true;

    try {
        await vscode.workspace.fs.stat(diskCachePath);
        cacheDirEnsured = true;
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
            try {
                await vscode.workspace.fs.createDirectory(diskCachePath);
                console.log(`CacheService: Created disk cache directory: ${diskCachePath.fsPath}`);
                cacheDirEnsured = true;
            } catch (createError) {
                console.error(`CacheService: Failed to create cache directory ${diskCachePath.fsPath}:`, createError);
                cacheDirEnsured = false;
            }
        } else {
            console.error(`CacheService: Failed to access cache directory ${diskCachePath.fsPath}:`, error);
            cacheDirEnsured = false;
        }
    }
    return cacheDirEnsured;
}

/**
 * Generates a safe filename from a cache key.
 */
function sanitizeKey(key: string): string {
    // Replace non-alphanumeric characters (except _) with underscores
    // Use base64 for robustness against various characters and length limits
    return Buffer.from(key).toString('base64url') + '.cache.json';
}

/**
 * Checks if a cache entry is still valid based on its TTL or a maxAge.
 */
function isEntryValid<T>(entry: CacheEntry<T>, maxAgeMs?: number): boolean {
    const age = Date.now() - entry.timestamp;
    const effectiveTtl = maxAgeMs !== undefined ? maxAgeMs : entry.ttl;
    return age >= 0 && age < effectiveTtl;
}

/**
 * Gets the full URI for a cache file.
 * Returns undefined if the disk cache path is not initialized.
 */
function getCacheFileUri(key: string): vscode.Uri | undefined {
     if (!diskCachePath) return undefined;
     return vscode.Uri.joinPath(diskCachePath, sanitizeKey(key));
}

// --- Exported Cache Functions ---

/**
 * Initializes the cache service (required before first use).
 */
export function initializeCacheService(context: vscode.ExtensionContext): void {
    initializeCachePath(context);
}

/**
 * Retrieves an item from the cache.
 * Checks memory cache first, then disk cache.
 * Returns undefined if not found or expired.
 * 
 * @param key Cache key
 * @param maxAge Optional max age in seconds (overrides stored TTL for this check)
 */
export async function get<T>(
    key: string,
    maxAge?: number
): Promise<T | undefined> {
    // Remove lazy init - initialization MUST happen via initializeCacheService
    if (!diskCachePath) {
        console.error("CacheService.get: Cache service not initialized.");
        return undefined;
    }

    const maxAgeMs = maxAge !== undefined ? maxAge * 1000 : undefined;

    // 1. Check memory cache
    const memoryEntry = memoryCache.get(key);
    if (memoryEntry && isEntryValid(memoryEntry, maxAgeMs)) {
        // console.log(`CacheService: Memory cache hit for key: ${key}`); // Verbose
        return memoryEntry.value as T;
    }

    // 2. Check disk cache
    const fileUri = getCacheFileUri(key);
    if (!fileUri || !(await ensureCacheDirectoryExists())) return undefined;

    try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const entry = JSON.parse(Buffer.from(fileData).toString('utf8')) as CacheEntry<T>;

        if (isEntryValid(entry, maxAgeMs)) {
            // console.log(`CacheService: Disk cache hit for key: ${key}`); // Verbose
            // Promote to memory cache for faster subsequent access
            memoryCache.set(key, entry);
            return entry.value as T;
        } else {
            // Entry expired, delete it from disk asynchronously (fire and forget)
            console.log(`CacheService: Disk cache expired for key: ${key}. Deleting.`);
            // Use try-catch for async fs operations
            try {
                 await vscode.workspace.fs.delete(fileUri);
            } catch (err) {
                 console.error(`CacheService: Failed to delete expired cache file ${fileUri.fsPath}:`, err);
            }
            memoryCache.delete(key); // Remove from memory too
            return undefined;
        }
    } catch (error) {
        // Handle file not found or JSON parse errors gracefully
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
            console.warn(`CacheService: Failed to read or parse disk cache for key ${key}:`, error);
        }
        // Ensure removal from memory if disk read failed
        memoryCache.delete(key);
        return undefined;
    }
}

/**
 * Stores an item in the cache (memory and disk).
 * 
 * @param key Cache key
 * @param value Value to store
 * @param ttlSeconds Time-to-live in seconds (default: 1 hour)
 */
export async function set<T>(
    key: string,
    value: T,
    ttlSeconds: number = 3600
): Promise<void> {
     // Remove lazy init
     if (!diskCachePath) {
        console.error("CacheService.set: Cache service not initialized.");
        return;
    }

    const ttlMs = ttlSeconds * 1000;
    if (ttlMs <= 0) {
        console.warn(`CacheService: TTL for key "${key}" must be positive. Not caching.`);
        return;
    }

    const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl: ttlMs
    };

    // 1. Set memory cache
    memoryCache.set(key, entry);

    // 2. Set disk cache (asynchronously)
    const fileUri = getCacheFileUri(key);
    if (!fileUri || !(await ensureCacheDirectoryExists())) return;

    try {
        const content = Buffer.from(JSON.stringify(entry), 'utf8');
        await vscode.workspace.fs.writeFile(fileUri, content);
        // console.log(`CacheService: Disk cache set for key: ${key}`); // Verbose
    } catch (error) {
        console.error(`CacheService: Failed to write disk cache for key ${key}:`, error);
        // If disk write fails, potentially remove from memory cache too?
        // memoryCache.delete(key); // Optional: Keep memory cache consistent?
    }
}

/**
 * Deletes an item from both memory and disk cache.
 */
export async function del(key: string): Promise<void> {
     // Remove lazy init
     if (!diskCachePath) {
        console.error("CacheService.del: Cache service not initialized.");
        return;
    }

    // 1. Delete from memory
    memoryCache.delete(key);

    // 2. Delete from disk
    const fileUri = getCacheFileUri(key);
    if (!fileUri || !(await ensureCacheDirectoryExists())) return;

    try {
        await vscode.workspace.fs.delete(fileUri);
        // console.log(`CacheService: Deleted cache for key: ${key}`); // Verbose
    } catch (error) {
        // Ignore errors if file doesn't exist (already deleted)
        if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
            console.error(`CacheService: Failed to delete disk cache for key ${key}:`, error);
        }
    }
}

/**
 * Clears the entire cache (memory and disk).
 */
export async function clearAll(context?: vscode.ExtensionContext): Promise<void> {
    // If context is provided ensure init, otherwise rely on it being initialized already
    if (context && !diskCachePath) initializeCachePath(context);
    
    memoryCache.clear();
    console.log('CacheService: Memory cache cleared.');

    // 2. Clear disk cache
    if (!diskCachePath || !(await ensureCacheDirectoryExists())) {
         console.log('CacheService: Disk cache path not available or directory missing, skipping disk clear.');
         return;
    }

    try {
        console.log(`CacheService: Clearing disk cache directory: ${diskCachePath.fsPath}`);
        const entries = await vscode.workspace.fs.readDirectory(diskCachePath);
        for (const [name, type] of entries) {
            if (type === vscode.FileType.File && name.endsWith('.cache.json')) {
                const fileUri = vscode.Uri.joinPath(diskCachePath, name);
                try {
                    await vscode.workspace.fs.delete(fileUri);
                } catch (deleteError) {
                     // Log errors deleting individual files but continue
                    console.error(`CacheService: Failed to delete cache file ${fileUri.fsPath} during clearAll:`, deleteError);
                }
            }
        }
        console.log('CacheService: Disk cache cleared.');
    } catch (error) {
        console.error(`CacheService: Failed to clear disk cache:`, error);
    }
} 