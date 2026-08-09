import assert from 'node:assert/strict'
import test from 'node:test'
import { syncAppVersionMetadata } from '../src/main/services/database/appVersionMetadata.js'

function createDatabase(previousVersion) {
  const executed = []
  return {
    executed,
    exec(sql) {
      executed.push(sql)
    },
    prepare(sql) {
      executed.push(sql)
      return {
        get: () => previousVersion ? { value: previousVersion } : undefined,
        run: (...values) => executed.push(values),
      }
    },
  }
}

test('application upgrades update metadata without deleting indexed data', () => {
  const database = createDatabase('1.3.1')

  assert.equal(syncAppVersionMetadata(database, '1.4.0'), '1.3.1')
  assert.ok(database.executed.some(statement => String(statement).startsWith('UPDATE app_metadata')))
  assert.ok(database.executed.every(statement => !String(statement).includes('DELETE FROM')))
})

test('first launch records the current application version', () => {
  const database = createDatabase(null)

  assert.equal(syncAppVersionMetadata(database, '1.4.0'), null)
  assert.ok(database.executed.some(statement => String(statement).startsWith('INSERT INTO app_metadata')))
})
