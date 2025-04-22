export const notesOperations = {
  // Cache prepared statements for better performance
  _notesStatements: {
    setNotes: null,
    deleteNotes: null,
    getNotes: null,
    getOrphanedNotes: null,
  },

  // Initialize statements when first needed
  _initNotesStatements() {
    if (!this._notesStatements.setNotes) {
      this._notesStatements.deleteNotes = this.db.prepare(
        'DELETE FROM notes WHERE target_path = ? AND target_type = ?',
      )

      this._notesStatements.setNotes = this.db.prepare(
        `INSERT INTO notes (target_path, target_type, content, updated_at)
         VALUES (?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(target_path, target_type) DO UPDATE SET
         content = excluded.content,
         updated_at = excluded.updated_at`,
      )

      this._notesStatements.getNotes = this.db.prepare(
        'SELECT content FROM notes WHERE target_path = ? AND target_type IN (\'file\', \'folder\', \'emoji\')',
      )

      this._notesStatements.getOrphanedNotes = this.db.prepare(
        `SELECT n.*, 
         CASE 
           WHEN n.target_type = 'file' THEN NOT EXISTS(SELECT 1 FROM files WHERE path = n.target_path)
           WHEN n.target_type = 'folder' THEN NOT EXISTS(SELECT 1 FROM folders WHERE path = n.target_path)
           WHEN n.target_type = 'emoji' THEN NOT EXISTS(SELECT 1 FROM emojis WHERE path = n.target_path)
           ELSE 1
         END as is_orphaned
         FROM notes n
         WHERE is_orphaned = 1
         ORDER BY updated_at DESC`,
      )
    }
  },

  setNotes(path, notes, type = null) {
    this._initNotesStatements()

    if (!type) {
      // Determine type based on existence in different tables
      if (path.startsWith('emoji:/')) {
        type = 'emoji'

        // For emojis, ensure the emoji exists in the database
        const emoji = this.getEmoji(path)
        if (!emoji && notes) {
          // Extract emoji character from path (emoji:/😀)
          const char = path.replace('emoji:/', '')
          const name = char // Default name is the character itself

          // Create emoji record if it doesn't exist
          this.upsertEmoji({
            path,
            char,
            name,
          })
        }
      }
      else {
        const fileExists = this.db.prepare('SELECT 1 FROM files WHERE path = ?').get(path)
        if (fileExists) {
          type = 'file'
        }
        else {
          const folderExists = this.db.prepare('SELECT 1 FROM folders WHERE path = ?').get(path)
          type = folderExists ? 'folder' : 'file' // Default to file if can't determine
        }
      }
    }

    if (notes === null || notes === '') {
      // Delete notes if empty
      return this._notesStatements.deleteNotes.run(path, type)
    }

    // Upsert notes with correct UNIQUE constraint handling
    return this._notesStatements.setNotes.run(path, type, notes)
  },

  getNotes(path) {
    this._initNotesStatements()
    const result = this._notesStatements.getNotes.get(path)
    return result?.content || null
  },

  // Get all orphaned notes (notes without corresponding files/folders)
  getOrphanedNotes() {
    this._initNotesStatements()
    return this._notesStatements.getOrphanedNotes.all()
  },
}
