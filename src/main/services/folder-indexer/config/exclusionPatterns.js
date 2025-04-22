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
    '*.iso',
    '*.vmdk',
    '*.vdi',
    '*.bak',
    '*.tmp',
    '*.temp',
    '*.lock',
    '*.log',
    '*.mp4',
    '*.mov',
    '*.avi',
    '*.mkv',
  ],
}

/**
 * Helper to check if a path should be excluded
 */
export function isExcludedPath(path) {
  return EXCLUDED_PATTERNS.FOLDERS.some(
    folder => path.includes(`/${folder}/`) || path.includes(`\\${folder}\\`)
      || path.endsWith(`/${folder}`) || path.endsWith(`\\${folder}`),
  )
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

  return [
    /(^|[/\\])\../, // dot files and folders
    ...folderPatterns,
    ...EXCLUDED_PATTERNS.FILES,
  ]
}
