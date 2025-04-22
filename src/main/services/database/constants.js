/**
 * Database Constants
 *
 * This file defines constants used throughout the database operations.
 * Centralizing these values makes code more maintainable and prevents magic numbers/strings.
 */

// Query limits
export const QUERY_LIMITS = {
  QUICK_SEARCH: 100,
  FILTERED_SEARCH: 100,
  APPLICATION_SEARCH: 9,
  SIMILAR_IMAGES: 20,
}

// Default thresholds
export const THRESHOLDS = {
  SIMILAR_IMAGES: 0.9,
  HAMMING_DISTANCE_MAX: 64,
}

// Database types
export const DB_TYPES = {
  FILE: 'file',
  FOLDER: 'folder',
  APPLICATION: 'application',
}

// Tables
export const TABLES = {
  FILES: 'files',
  FOLDERS: 'folders',
  APPLICATIONS: 'applications',
  TAGS: 'tags',
  FILE_TAGS: 'file_tags',
  NOTES: 'notes',
  WATCHED_FOLDERS: 'watched_folders',
  APP_METADATA: 'app_metadata',
}

// File categories
export const FILE_CATEGORIES = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  AUDIO: 'audio',
  VIDEO: 'video',
  FOLDER: 'folder',
}

// Console message styles
export const CONSOLE_STYLES = {
  ERROR: '\x1B[31m%s\x1B[0m',
  WARNING: '\x1B[33m%s\x1B[0m',
  INFO: '\x1B[36m%s\x1B[0m',
  SUCCESS: '\x1B[32m%s\x1B[0m',
  DEBUG: '\x1B[35m%s\x1B[0m',
}
