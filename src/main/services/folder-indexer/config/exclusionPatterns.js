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
 */
export function createIgnorePatterns() {
  const folderPatterns = EXCLUDED_PATTERNS.FOLDERS.map(folder => [
    `**/${folder}/**`,
    `**/${folder}`,
    `${folder}/**`,
    `${folder}`,
  ]).flat()

  // File patterns need **/ prefix to match at any depth
  const filePatterns = EXCLUDED_PATTERNS.FILES.map((pattern) => {
    // If pattern already starts with **/, leave it as is
    if (pattern.startsWith('**/')) {
      return pattern
    }
    // Otherwise, add **/ prefix for recursive matching
    return `**/${pattern}`
  })

  return [
    /(^|[/\\])\../, // dot files and folders
    ...folderPatterns,
    ...filePatterns,
  ]
}
