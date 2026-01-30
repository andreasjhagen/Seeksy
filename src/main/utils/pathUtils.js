/**
 * Path Utilities
 *
 * Provides consistent path handling across platforms for the indexing system.
 * Handles normalization, comparison, and overlap detection for watched folders.
 */

/**
 * Normalize a file path for consistent storage and comparison.
 * - Uses forward slashes for consistency
 * - Removes trailing slashes (except for root)
 * - Handles case sensitivity based on platform
 *
 * @param {string} filePath - Path to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(filePath) {
  if (!filePath)
    return filePath

  // Convert to forward slashes for consistency
  let normalized = filePath.replace(/\\/g, '/')

  // Remove trailing slash (unless root like "/" or "C:/")
  if (normalized.length > 1 && normalized.endsWith('/') && !normalized.match(/^[A-Z]:\/$/i)) {
    normalized = normalized.slice(0, -1)
  }

  // On Windows, lowercase for case-insensitive comparison
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase()
  }

  return normalized
}

/**
 * Compare two paths for equality (platform-aware)
 *
 * @param {string} path1 - First path
 * @param {string} path2 - Second path
 * @returns {boolean} True if paths are equal
 */
export function pathsEqual(path1, path2) {
  return normalizePath(path1) === normalizePath(path2)
}

/**
 * Check if childPath is inside parentPath (not equal)
 *
 * @param {string} childPath - Potential child path
 * @param {string} parentPath - Potential parent path
 * @returns {boolean} True if childPath is inside parentPath
 */
export function isChildPath(childPath, parentPath) {
  const normalChild = normalizePath(childPath)
  const normalParent = normalizePath(parentPath)

  // Must start with parent path followed by a separator
  return normalChild.startsWith(`${normalParent}/`)
}

/**
 * Check if a path is equal to or inside another path
 *
 * @param {string} childPath - Potential child path
 * @param {string} parentPath - Potential parent path
 * @returns {boolean} True if childPath equals or is inside parentPath
 */
export function isChildOrEqual(childPath, parentPath) {
  const normalChild = normalizePath(childPath)
  const normalParent = normalizePath(parentPath)

  return normalChild === normalParent || normalChild.startsWith(`${normalParent}/`)
}

/**
 * Get the depth (number of directory levels) of a path relative to another
 *
 * @param {string} childPath - Child path
 * @param {string} parentPath - Parent path
 * @returns {number} Depth relative to parent, or -1 if not a child
 */
export function getRelativeDepth(childPath, parentPath) {
  const normalChild = normalizePath(childPath)
  const normalParent = normalizePath(parentPath)

  if (normalChild === normalParent) {
    return 0
  }

  if (!normalChild.startsWith(`${normalParent}/`)) {
    return -1 // Not a child
  }

  const relativePath = normalChild.slice(normalParent.length + 1)
  return relativePath.split('/').filter(Boolean).length
}

/**
 * Get the absolute depth of a path (number of segments)
 *
 * @param {string} filePath - Path to measure
 * @returns {number} Number of path segments
 */
export function getPathDepth(filePath) {
  const normalized = normalizePath(filePath)
  return normalized.split('/').filter(Boolean).length
}

/**
 * Check for overlapping watched folders.
 * Considers depth settings to determine actual coverage.
 *
 * @param {string} newPath - New watched folder path
 * @param {number} newDepth - Depth setting for new folder (Infinity for unlimited)
 * @param {Array<{path: string, depth?: number}>} existingFolders - Existing watched folders
 * @returns {object} Result object with overlaps boolean, optional reason string, and optional existingFolder
 */
export function checkWatchedFolderOverlap(newPath, newDepth, existingFolders) {
  const normalizedNew = normalizePath(newPath)

  for (const folder of existingFolders) {
    const normalizedExisting = normalizePath(folder.path)
    const existingDepth = folder.depth ?? Infinity

    // Skip if paths are equal (updating existing)
    if (normalizedNew === normalizedExisting) {
      continue
    }

    // Case 1: New path is inside an existing watched folder
    if (isChildPath(normalizedNew, normalizedExisting)) {
      const relDepth = getRelativeDepth(normalizedNew, normalizedExisting)

      // Check if the existing folder's depth reaches the new path
      if (existingDepth === Infinity || (existingDepth !== -1 && relDepth <= existingDepth)) {
        return {
          overlaps: true,
          reason: `"${newPath}" is already covered by watched folder "${folder.path}" (depth: ${existingDepth === Infinity ? 'unlimited' : existingDepth})`,
          existingFolder: folder,
        }
      }
    }

    // Case 2: An existing watched folder is inside the new path
    if (isChildPath(normalizedExisting, normalizedNew)) {
      const relDepth = getRelativeDepth(normalizedExisting, normalizedNew)

      // Check if the new folder's depth would reach the existing folder
      if (newDepth === Infinity || (newDepth !== -1 && relDepth <= newDepth)) {
        return {
          overlaps: true,
          reason: `"${newPath}" (depth: ${newDepth === Infinity ? 'unlimited' : newDepth}) would overlap with existing watched folder "${folder.path}"`,
          existingFolder: folder,
        }
      }
    }
  }

  return { overlaps: false }
}

/**
 * Get the cache key for a path (normalized and platform-appropriate)
 * Useful for consistent Map/cache lookups
 *
 * @param {string} filePath - Path to convert to cache key
 * @returns {string} Cache key
 */
export function getCacheKey(filePath) {
  return normalizePath(filePath)
}

/**
 * Check if a path string starts with another (platform-aware)
 * Properly handles path boundaries to avoid false positives like
 * "/home/foo" matching "/home/foobar"
 *
 * @param {string} fullPath - Full path to check
 * @param {string} prefix - Prefix path
 * @returns {boolean} True if fullPath starts with prefix as a proper path prefix
 */
export function pathStartsWith(fullPath, prefix) {
  const normalFull = normalizePath(fullPath)
  const normalPrefix = normalizePath(prefix)

  // Exact match
  if (normalFull === normalPrefix) {
    return true
  }

  // Must have separator after prefix
  return normalFull.startsWith(`${normalPrefix}/`)
}
