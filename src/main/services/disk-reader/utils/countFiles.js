import fs from 'node:fs'
import path from 'node:path'
import { EXCLUDED_PATTERNS } from '../../folder-indexer/config/exclusionPatterns'

// Maximum concurrent directory reads to avoid overwhelming the filesystem
const MAX_CONCURRENT_READS = 50

// Pre-compile file exclusion patterns for better performance
const _compiledFilePatterns = EXCLUDED_PATTERNS.FILES.map((pattern) => {
  // Convert glob pattern (e.g., *.log) to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
    .replace(/\*/g, '.*') // * -> .*
    .replace(/\?/g, '.') // ? -> .
  return new RegExp(`^${escaped}$`, 'i')
})

// Pre-lowercase excluded folder names for case-insensitive comparison
const _excludedFoldersLower = EXCLUDED_PATTERNS.FOLDERS.map(f => f.toLowerCase())

/**
 * Check if a filename matches any excluded file pattern
 */
function isExcludedFile(filename) {
  return _compiledFilePatterns.some(pattern => pattern.test(filename))
}

/**
 * Check if a folder name matches any excluded folder pattern (case-insensitive)
 */
function isExcludedFolder(foldername) {
  return _excludedFoldersLower.includes(foldername.toLowerCase())
}

/**
 * Count files and folders in a directory using parallel operations for performance
 * Uses withFileTypes to avoid separate stat() calls - much faster than traditional approach
 *
 * @param {string} folderPath - Path to the folder
 * @param {number} depth - Maximum depth to recurse (Infinity for unlimited)
 * @returns {Promise<{fileCount: number, folderCount: number}>} Object with file and folder counts
 */
export async function countFolderContent(folderPath, depth = Infinity) {
  let fileCount = 0
  let folderCount = 0

  const processDir = async (dirPath, remainingDepth) => {
    try {
      // withFileTypes avoids separate stat() calls - major performance win
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const subdirs = []

      for (const entry of entries) {
        // Skip hidden files/folders
        if (entry.name.startsWith('.'))
          continue

        if (entry.isFile()) {
          // Skip files matching excluded patterns (*.log, *.bak, *.tmp, etc.)
          if (!isExcludedFile(entry.name)) {
            fileCount++
          }
        }
        else if (entry.isDirectory()) {
          // Skip excluded folders (case-insensitive)
          if (isExcludedFolder(entry.name))
            continue

          folderCount++
          // Queue subdirectory for processing if depth allows
          if (remainingDepth > 0) {
            subdirs.push(path.join(dirPath, entry.name))
          }
        }
      }

      // Process subdirectories in parallel batches
      // This is where the parallelism happens:
      // Instead of: await processDir(subdir1); await processDir(subdir2); ...
      // We do: await Promise.all([processDir(subdir1), processDir(subdir2), ...])
      if (subdirs.length > 0) {
        for (let i = 0; i < subdirs.length; i += MAX_CONCURRENT_READS) {
          const batch = subdirs.slice(i, i + MAX_CONCURRENT_READS)
          // All directories in this batch are read CONCURRENTLY
          await Promise.all(batch.map(dir => processDir(dir, remainingDepth - 1)))
        }
      }
    }
    catch {
      // Silently skip inaccessible directories
    }
  }

  await processDir(folderPath, depth)
  return { fileCount, folderCount }
}
