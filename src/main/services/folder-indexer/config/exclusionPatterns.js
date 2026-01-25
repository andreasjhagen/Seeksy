/**
 * Patterns for excluding files and folders from indexing
 */
export const EXCLUDED_PATTERNS = {
  FOLDERS: [
    // Development folders
    'node_modules',
    '.git',
    '.idea',
    '.vscode',
    'dist',
    'build',
    'coverage',
    'tmp',
    'temp',
    // System folders
    '$RECYCLE.BIN',
    'System Volume Information',
    // macOS system files
    '.Trash',
    '.DS_Store',
    '__MACOSX',
    // Common folders to exclude
    'bower_components',
    'jspm_packages',
    '.cache',
    '.npm',
    '.yarn',
    'Cache',
    'CacheStorage',
    'backup',
    '.backup',
    'logs',
    'log',
    // App-specific folders to prevent infinite loops
    'thumbnail-cache',
    'app-icons',
  ],
  FILES: [
    // Large disk images and virtual machine files
    '*.vmdk',
    '*.vdi',
    // Temporary and backup files
    '*.bak',
    '*.tmp',
    '*.temp',
    '*.lock',
    '*.log',
    // Seeksy database files - prevent infinite loops when indexing userData folder
    'file-index.db',
    'file-index.db-wal',
    'file-index.db-shm',
  ],
}

// Pre-compile exclusion patterns into a single regex for faster matching
const _escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const _compiledFolderPattern = new RegExp(
  EXCLUDED_PATTERNS.FOLDERS.map((folder) => {
    const escaped = _escapeRegex(folder)
    // Match folder anywhere in path with separators
    return `(?:[/\\\\]${escaped}[/\\\\])|(?:[/\\\\]${escaped}$)`
  }).join('|'),
  'i', // Case-insensitive for Windows compatibility
)

/**
 * Helper to check if a path should be excluded
 * Uses pre-compiled regex for better performance
 */
export function isExcludedPath(path) {
  return _compiledFolderPattern.test(path)
}

/**
 * Create a chokidar-compatible ignore patterns array
 * NOTE: chokidar 4.x's internal anymatch does NOT support glob patterns as strings
 * (it only does exact string matching). We must use RegExp or functions.
 */
export function createIgnorePatterns() {
  // Build folder exclusion patterns
  const folderPatterns = EXCLUDED_PATTERNS.FOLDERS.map((folder) => {
    // Create regex that matches:
    // - /folder/ anywhere in path
    // - /folder at end of path (the folder itself)
    // - folder/ at start (relative path)
    const escaped = _escapeRegex(folder)
    return new RegExp(`(?:[/\\\\]${escaped}(?:[/\\\\]|$))|(?:^${escaped}(?:[/\\\\]|$))`, 'i')
  })

  // Build file exclusion patterns
  const filePatterns = EXCLUDED_PATTERNS.FILES.map((pattern) => {
    // Convert glob pattern to regex
    // *.ext -> matches any file ending with .ext
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
      .replace(/\*/g, '.*') // * -> .*
      .replace(/\?/g, '.') // ? -> .
    return new RegExp(`(?:[/\\\\]|^)${escaped}$`, 'i')
  })

  return [
    /(^|[/\\])\./, // dot files and folders (hidden files)
    ...folderPatterns,
    ...filePatterns,
  ]
}
