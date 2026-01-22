import fs from 'node:fs'
import path from 'node:path'
import { EXCLUDED_PATTERNS } from '../../folder-indexer/config/exclusionPatterns'

/**
 * Count files and folders in a directory
 * @param {string} folderPath - Path to the folder
 * @param {number} depth - Maximum depth to recurse (Infinity for unlimited)
 * @returns {Promise<{fileCount: number, folderCount: number}>} Object with file and folder counts
 */
export async function countFolderContent(folderPath, depth = Infinity) {
  let fileCount = 0
  let folderCount = 0

  try {
    const entries = await fs.promises.readdir(folderPath)

    for (const entry of entries) {
      if (entry.startsWith('.') || EXCLUDED_PATTERNS.FOLDERS.includes(entry))
        continue

      try {
        const fullPath = path.join(folderPath, entry)
        const stat = await fs.promises.stat(fullPath)

        if (stat.isFile()) {
          fileCount++
        }
        else if (stat.isDirectory()) {
          folderCount++
          // Only recurse if we haven't reached max depth
          if (depth > 0) {
            const subCounts = await countFolderContent(fullPath, depth - 1)
            fileCount += subCounts.fileCount
            folderCount += subCounts.folderCount
          }
        }
      }
      catch (entryError) {
        console.warn(`Skipping problematic entry ${entry}:`, entryError)
        continue
      }
    }
  }
  catch (error) {
    console.warn(`Error reading directory ${folderPath}:`, error.message)
  }

  return { fileCount, folderCount }
}
