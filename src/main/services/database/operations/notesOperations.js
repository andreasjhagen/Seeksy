export const notesOperations = {
  setNotes(path, notes, type = null) {
    if (!type) {
      // Determine type based on existence in files or folders table
      const fileExists = this.db.prepare('SELECT 1 FROM files WHERE path = ?').get(path)
      type = fileExists ? 'file' : 'folder'
    }

    if (notes === null || notes === '') {
      // Delete notes if empty
      return this.db
        .prepare('DELETE FROM notes WHERE target_path = ? AND target_type = ?')
        .run(path, type)
    }

    // Upsert notes with correct UNIQUE constraint handling
    return this.db
      .prepare(
        `INSERT INTO notes (target_path, target_type, content, updated_at)
         VALUES (?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(target_path, target_type) DO UPDATE SET
         content = excluded.content,
         updated_at = excluded.updated_at`,
      )
      .run(path, type, notes)
  },

  getNotes(path) {
    const result = this.db
      .prepare(
        'SELECT content FROM notes WHERE target_path = ? AND target_type IN (\'file\', \'folder\')',
      )
      .get(path)
    return result?.content || null
  },

  // New method to get all orphaned notes (notes without corresponding files/folders)
  getOrphanedNotes() {
    return this.db
      .prepare(
        `SELECT n.*, 
         CASE 
           WHEN n.target_type = 'file' THEN NOT EXISTS(SELECT 1 FROM files WHERE path = n.target_path)
           ELSE NOT EXISTS(SELECT 1 FROM folders WHERE path = n.target_path)
         END as is_orphaned
         FROM notes n
         WHERE is_orphaned = 1
         ORDER BY updated_at DESC`,
      )
      .all()
  },
}
