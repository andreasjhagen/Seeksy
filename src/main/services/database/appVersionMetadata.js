/**
 * Persist the running application version without altering application data.
 * Schema compatibility is handled independently by database migrations.
 *
 * @param {object} database A better-sqlite3 compatible connection.
 * @param {string} currentVersion The running application version.
 * @returns {string|null} The previously recorded version.
 */
export function syncAppVersionMetadata(database, currentVersion) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  const row = database
    .prepare('SELECT value FROM app_metadata WHERE key = ?')
    .get('app_version')

  if (row) {
    if (row.value !== currentVersion) {
      database
        .prepare('UPDATE app_metadata SET value = ? WHERE key = ?')
        .run(currentVersion, 'app_version')
    }
    return row.value
  }

  database
    .prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
    .run('app_version', currentVersion)
  return null
}
