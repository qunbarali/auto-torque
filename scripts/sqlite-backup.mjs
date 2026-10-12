import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const [, , source, destination] = process.argv
if (!source || !destination) {
  console.error('Usage: node scripts/sqlite-backup.mjs <source.sqlite> <destination.sqlite>')
  process.exit(2)
}

fs.mkdirSync(path.dirname(destination), { recursive: true })
if (fs.existsSync(destination)) fs.rmSync(destination, { force: true })

const db = new Database(source, { readonly: true, timeout: 10_000 })
try {
  db.pragma('busy_timeout = 10000')
  await db.backup(destination)
} finally {
  db.close()
}

const verify = new Database(destination, { readonly: true })
try {
  const result = verify.pragma('integrity_check', { simple: true })
  if (result !== 'ok') throw new Error(`SQLite integrity check failed: ${result}`)
  console.log(`SQLite backup verified: ${destination}`)
} finally {
  verify.close()
}
