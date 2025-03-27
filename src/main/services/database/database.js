import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { applicationsOperations } from './operations/applicationsOperations.js'
import { favoritesOperations } from './operations/favoritesOperations.js'
import { fileOperations } from './operations/fileOperations'
import { folderOperations } from './operations/folderOperations.js'
import { notesOperations } from './operations/notesOperations.js'
import { searchOperations } from './operations/searchOperations'
import { watchedFolderOperations } from './operations/watchedFolderOperations'

class FileDatabase {
  constructor() {
    // Load database based on environment
    if (is.dev) {
      // Debug DB:
      this.db = new Database('file-index.db')
      console.log('\x1B[35m[DEBUG DATABASE LOADED]\x1B[0m')
    }
    else {
      // Prod DB:
      const dbPath = path.join(app.getPath('userData'), 'file-index.db')
      this.db = new Database(dbPath)
    }

    // Check and update app version if needed
    this.checkAppVersion()

    this.initializeDatabase()

    // Add WAL mode for better performance
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('cache_size = -2000') // Use 2MB of cache
  }

  checkAppVersion() {
    // Create app_metadata table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
    const currentVersion = app.getVersion()
    const row = this.db.prepare('SELECT value FROM app_metadata WHERE key = \'app_version\'').get()
    if (row) {
      if (row.value !== currentVersion) {
        console.log(`\x1b[33m[Database] Clearing database due to version update (${row.value} -> ${currentVersion})\x1b[0m`)
        // Version mismatch: clear all tables except watched_folders and app_metadata
        this.db.exec(`
          DELETE FROM files;
          DELETE FROM folders;
          DELETE FROM tags;
          DELETE FROM file_tags;
          DELETE FROM applications;
        `)
        this.db
          .prepare('UPDATE app_metadata SET value = ? WHERE key = \'app_version\'')
          .run(currentVersion)
      }
    }
    else {
      // First run: insert current version
      this.db
        .prepare('INSERT INTO app_metadata (key, value) VALUES (\'app_version\', ?)')
        .run(currentVersion)
    }
  }

  initializeDatabase() {
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
        target_type TEXT NOT NULL CHECK(target_type IN ('file', 'folder')),
        content TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        UNIQUE(target_path, target_type)
      );

      CREATE INDEX IF NOT EXISTS idx_notes_target ON notes(target_path, target_type);

      -- Create all_items view
      CREATE VIEW IF NOT EXISTS all_items AS
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
      LEFT JOIN notes n ON f.path = n.target_path AND n.target_type = 'folder';

      -- Essential indexes only
      CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
      CREATE INDEX IF NOT EXISTS idx_files_mime ON files(mimeType);
      CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folderPath);
      CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parentPath);
      CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(isFavorite);
      CREATE INDEX IF NOT EXISTS idx_folders_favorite ON folders(isFavorite);
      CREATE INDEX IF NOT EXISTS idx_applications_favorite ON applications(isFavorite);
    `)
  }

  resetDatabase() {
    try {
      // Disable foreign key constraints temporarily
      this.db.pragma('foreign_keys = OFF');
      
      // Begin transaction for atomicity
      this.db.exec('BEGIN TRANSACTION;');
      
      // Drop view first
      this.db.exec('DROP VIEW IF EXISTS all_items;');
      
      // Drop all tables in proper order to avoid constraint issues
      const tables = [
        'file_tags',
        'tags',
        'notes',
        'files',
        'folders',
        'applications',
        'watched_folders'
        // Not dropping app_metadata to preserve version information
      ];
      
      for (const table of tables) {
        this.db.exec(`DROP TABLE IF EXISTS ${table};`);
      }
      
      // Commit the changes
      this.db.exec('COMMIT;');
      
      // Re-enable foreign key constraints
      this.db.pragma('foreign_keys = ON');
      
      console.log('\x1b[33m[Database] Successfully reset all tables\x1b[0m');
      
      // Recreate the database schema
      this.initializeDatabase();
      
      return { success: true, message: 'Database has been reset successfully' };
    } catch (error) {
      // If error occurs, rollback any partial changes
      this.db.exec('ROLLBACK;');
      this.db.pragma('foreign_keys = ON');
      console.error('\x1b[31m[Database] Failed to reset database:\x1b[0m', error.message);
      return { success: false, message: `Failed to reset database: ${error.message}` };
    }
  }
}

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
)
