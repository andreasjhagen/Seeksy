import fs from 'node:fs'
import path from 'node:path'
import { EXCLUDED_PATTERNS } from '../../folder-indexer/config/exclusionPatterns'

export async function countFolderContent(folderPath, depth = Infinity, includeFolders = false) {
  let count = 0
  const entries = await fs.promises.readdir(folderPath)

  for (const entry of entries) {
    if (entry.startsWith('.') || EXCLUDED_PATTERNS.FOLDERS.includes(entry))
      continue

    try {
      const fullPath = path.join(folderPath, entry)
      const stat = await fs.promises.stat(fullPath)

      if (stat.isFile()) {
        count++
      }
      else if (stat.isDirectory()) {
        if (includeFolders) {
          count++
        }
        // Only recurse if we haven't reached max depth
        if (depth > 0) {
          count += await countFolderContent(fullPath, depth - 1, includeFolders)
        }
      }
    }
    catch (entryError) {
      console.warn(`Skipping problematic entry ${entry}:`, entryError)
      continue
    }
  }

  return count
}
