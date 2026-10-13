import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const target = path.join(root, 'prisma', 'migrations-sqlite', '00000000000000_baseline')
await mkdir(target, { recursive: true })
const prisma = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const sql = execFileSync(prisma, ['migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], {
  cwd: root,
  encoding: 'utf8',
  // Windows cannot execute .cmd files directly through execFileSync without a shell.
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'inherit'],
})
await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(target, 'migration.sql'), sql))
console.log(`SQLite baseline written to ${path.relative(root, target)}/migration.sql`)
