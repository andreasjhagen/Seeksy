/**
 * Database Service
 *
 * Main database configuration and initialization module that manages connections to SQLite.
 * This file serves as the central point for database operations and imports all operation modules.
 *
 * Features:
 * - SQLite connection management with better-sqlite3
 * - Database initialization and schema creation
 * - Performance optimization with prepared statements
 * - Version management for database schema
 */

import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { createLogger } from '../../utils/logger.js'
import { applicationsOperations } from './operations/applicationsOperations.js'
import { emojisOperations } from './operations/emojisOperations.js'
import { favoritesOperations } from './operations/favoritesOperations.js'
import { fileOperations } from './operations/fileOperations'
import { folderOperations } from './operations/folderOperations.js'
import { notesOperations } from './operations/notesOperations.js'
import { searchOperations } from './operations/searchOperations'
import { watchedFolderOperations } from './operations/watchedFolderOperations'

// Create a dedicated logger for database operations
const logger = createLogger('Database')

class FileDatabase {
  constructor() {
    this._initializeDb()
    this._setupPragmas()
    this._checkAppVersion()
    this._initializeSchema()
    this._runMigrations()
  }

  // Initialize database connection based on environment
  _initializeDb() {
    try {
      if (is.dev) {
        // In dev mode, only enable verbose logging if explicitly requested
        // Set VERBOSE_SQL=1 in env to see all SQL queries
        const verboseLogger = process.env.VERBOSE_SQL ? logger.debug.bind(logger) : null
        this.db = new Database('file-index.db', { verbose: verboseLogger })
        logger.debug('Development database loaded at file-index.db')
      }
      else {
        // Production DB in user data folder
        const dbPath = path.join(app.getPath('userData'), 'file-index.db')
        this.db = new Database(dbPath)
        logger.info(`Production database loaded at ${dbPath}`)
      }
    }
    catch (error) {
      logger.error('Failed to initialize database:', error)
      throw error // Critical error - rethrow to prevent app from starting with broken DB
    }
  }

  // Set up performance optimization pragmas
  _setupPragmas() {
    try {
      // Use Write-Ahead Logging for better concurrency
      this.db.pragma('journal_mode = WAL')

      // Set synchronous mode to NORMAL for better performance
      this.db.pragma('synchronous = NORMAL')

      // Store temp tables in memory
      this.db.pragma('temp_store = MEMORY')

      // Use 2MB of memory for caching
      this.db.pragma('cache_size = -2000')

      // Enable foreign keys support
      this.db.pragma('foreign_keys = ON')

      logger.debug('Database pragmas configured for optimal performance')
    }
    catch (error) {
      logger.error('Failed to set database pragmas:', error)
    }
  }

  // Check and update app version in database
  _checkAppVersion() {
    try {
      // Create app_metadata table if not exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `)

      const currentVersion = app.getVersion()
      const stmt = this.db.prepare('SELECT value FROM app_metadata WHERE key = ?')
      const row = stmt.get('app_version')

      if (row) {
        if (row.value !== currentVersion) {
          logger.warn(`Version update detected: ${row.value} -> ${currentVersion}, clearing database`)

          // Version mismatch: clear tables in a transaction for atomicity
          this.db.transaction(() => {
            this.db.exec(`
              DELETE FROM files;
              DELETE FROM folders;
              DELETE FROM tags;
              DELETE FROM file_tags;
              DELETE FROM applications;
              DELETE FROM emojis;
            `)

            // Update version in database
            this.db
              .prepare('UPDATE app_metadata SET value = ? WHERE key = ?')
              .run(currentVersion, 'app_version')
          })()

          logger.success('Database cleared successfully due to version update')
        }
        else {
          logger.debug(`Database version matches app version: ${currentVersion}`)
        }
      }
      else {
        // First run: insert current version
        this.db
          .prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
          .run('app_version', currentVersion)

        logger.info(`First run: Initialized database with version ${currentVersion}`)
      }
    }
    catch (error) {
      logger.error('Version check failed:', error)
    }
  }

  // Initialize database schema
  _initializeSchema() {
    try {
      // Create tables in a single transaction for atomicity
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            folderPath TEXT NOT NULL,
            watchedFolderPath TEXT,
            extension TEXT,
            size INTEGER,
            modifiedAt INTEGER,
            createdAt INTEGER,
            accessedAt INTEGER,
            indexedAt INTEGER,
            mimeType TEXT,
            sha256Hash TEXT,
            fileType TEXT,
            isFavorite BOOLEAN DEFAULT 0,
            favoriteAddedAt INTEGER,
            FOREIGN KEY (folderPath) REFERENCES folders(path) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (watchedFolderPath) REFERENCES watched_folders(path) ON DELETE CASCADE ON UPDATE CASCADE
          );

          CREATE TABLE IF NOT EXISTS folders (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parentPath TEXT,
            watchedFolderPath TEXT,
            modifiedAt INTEGER,
            indexedAt INTEGER,
            directChildCount INTEGER DEFAULT 0,
            totalChildCount INTEGER DEFAULT 0,
            directFileCount INTEGER DEFAULT 0,
            totalFileCount INTEGER DEFAULT 0,
            isFavorite BOOLEAN DEFAULT 0,
            favoriteAddedAt INTEGER,
            FOREIGN KEY (watchedFolderPath) REFERENCES watched_folders(path) ON DELETE CASCADE ON UPDATE CASCADE
          );

          CREATE TABLE IF NOT EXISTS emojis (
            path TEXT PRIMARY KEY,
            char TEXT NOT NULL,
            name TEXT NOT NULL,
            isFavorite BOOLEAN DEFAULT 0,
            favoriteAddedAt INTEGER
          );

          CREATE TABLE IF NOT EXISTS watched_folders (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            totalFiles INTEGER DEFAULT 0,
            processedFiles INTEGER DEFAULT 0,
            lastModified INTEGER,
            lastIndexed INTEGER,
            depth INTEGER DEFAULT -1
          );

          CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
          );

          CREATE TABLE IF NOT EXISTS file_tags (
            file_path TEXT,
            tag_id INTEGER,
            PRIMARY KEY (file_path, tag_id),
            FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS applications (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            displayName TEXT,
            description TEXT,
            keywords TEXT,
            categories TEXT,
            icon TEXT,
            lastUpdated INTEGER,
            isSystem BOOLEAN DEFAULT 0,
            isCustomAdded BOOLEAN DEFAULT 0,
            applicationType TEXT,
            isFavorite BOOLEAN DEFAULT 0,
            favoriteAddedAt INTEGER
          );

          CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_path TEXT NOT NULL,
            target_type TEXT NOT NULL CHECK(target_type IN ('file', 'folder', 'emoji')),
            content TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            UNIQUE(target_path, target_type)
          );

          -- Indexes
          CREATE INDEX IF NOT EXISTS idx_notes_target ON notes(target_path, target_type);
          CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
          CREATE INDEX IF NOT EXISTS idx_files_mime ON files(mimeType);
          CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folderPath);
          CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parentPath);
          CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(isFavorite);
          CREATE INDEX IF NOT EXISTS idx_folders_favorite ON folders(isFavorite);
          CREATE INDEX IF NOT EXISTS idx_applications_favorite ON applications(isFavorite);
          CREATE INDEX IF NOT EXISTS idx_emojis_favorite ON emojis(isFavorite);
        `)

        // Create all_items view - recreate view if it exists to update any schema changes
        this.db.exec('DROP VIEW IF EXISTS all_items;')
        this.db.exec(`
          CREATE VIEW all_items AS
          -- Files
          SELECT 
            f.path,
            f.name,
            'file' as type,
            'files' as sourceTable,
            f.modifiedAt,
            f.indexedAt,
            f.mimeType,
            f.size,
            f.favoriteAddedAt,
            f.isFavorite,
            n.content as notes,
            f.fileType as category,
            GROUP_CONCAT(t.name) as tags
          FROM files f
          LEFT JOIN notes n ON f.path = n.target_path AND n.target_type = 'file'
          LEFT JOIN file_tags ft ON f.path = ft.file_path
          LEFT JOIN tags t ON t.id = ft.tag_id
          GROUP BY f.path

          UNION ALL

          -- Folders
          SELECT 
            f.path,
            f.name,
            'folder' as type,
            'folders' as sourceTable,
            f.modifiedAt,
            f.indexedAt,
            'directory' as mimeType,
            NULL as size,
            f.favoriteAddedAt,
            f.isFavorite,
            n.content as notes,
            'folder' as category,
            NULL as tags
          FROM folders f
          LEFT JOIN notes n ON f.path = n.target_path AND n.target_type = 'folder'
          
          UNION ALL
          
          -- Emojis
          SELECT
            e.path,
            e.name,
            'emoji' as type,
            'emojis' as sourceTable,
            NULL as modifiedAt,
            NULL as indexedAt,
            'emoji' as mimeType,
            NULL as size,
            e.favoriteAddedAt,
            e.isFavorite,
            n.content as notes,
            'emoji' as category,
            NULL as tags
          FROM emojis e
          LEFT JOIN notes n ON e.path = n.target_path AND n.target_type = 'emoji';
        `)
      })()

      logger.success('Database schema initialized successfully')
    }
    catch (error) {
      logger.error('Schema initialization failed:', error)
      throw error // Critical error
    }
  }

  // Run database migrations for schema updates
  _runMigrations() {
    try {
      // Migration: Add description, keywords, categories columns to applications table
      // This is safe to run multiple times as it checks if columns exist
      const tableInfo = this.db.pragma('table_info(applications)')
      const existingColumns = tableInfo.map(col => col.name)

      const columnsToAdd = [
        { name: 'description', type: 'TEXT' },
        { name: 'keywords', type: 'TEXT' },
        { name: 'categories', type: 'TEXT' },
      ]

      for (const column of columnsToAdd) {
        if (!existingColumns.includes(column.name)) {
          this.db.exec(`ALTER TABLE applications ADD COLUMN ${column.name} ${column.type}`)
          logger.info(`Added column '${column.name}' to applications table`)
        }
      }

      // Create index on description for faster search
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_applications_description ON applications(description)`)

      logger.debug('Database migrations completed')
    }
    catch (error) {
      logger.warn('Migration warning (non-critical):', error)
    }
  }

  // Reset the database (keeping version information)
  resetDatabase() {
    try {
      // Disable foreign key constraints for more efficient table dropping
      this.db.pragma('foreign_keys = OFF')

      // Begin transaction for atomicity
      this.db.exec('BEGIN TRANSACTION;')

      // Drop view first since it depends on tables
      this.db.exec('DROP VIEW IF EXISTS all_items;')

      // Drop tables in proper order to avoid constraint issues
      const tables = [
        'file_tags',
        'tags',
        'notes',
        'files',
        'folders',
        'applications',
        'emojis',
        'watched_folders',
        // Not dropping app_metadata to preserve version information
      ]

      for (const table of tables) {
        this.db.exec(`DROP TABLE IF EXISTS ${table};`)
      }

      // Commit the changes
      this.db.exec('COMMIT;')

      // Re-enable foreign key constraints
      this.db.pragma('foreign_keys = ON')

      logger.success('Successfully reset all database tables')

      // Recreate the database schema
      this._initializeSchema()

      return { success: true, message: 'Database has been reset successfully' }
    }
    catch (error) {
      // If error occurs, rollback any partial changes
      this.db.exec('ROLLBACK;')
      this.db.pragma('foreign_keys = ON')
      logger.error('Failed to reset database:', error)
      return { success: false, message: `Failed to reset database: ${error.message}` }
    }
  }

  // Gracefully close database connection
  close() {
    try {
      if (this.db) {
        this.db.close()
        logger.info('Database connection closed')
      }
    }
    catch (error) {
      logger.error('Error closing database:', error)
    }
  }
}

// Create a singleton instance
export const fileDB = new FileDatabase()

// Import operations
Object.assign(
  FileDatabase.prototype,
  fileOperations,
  watchedFolderOperations,
  searchOperations,
  folderOperations,
  favoritesOperations,
  applicationsOperations,
  notesOperations,
  emojisOperations,
)
