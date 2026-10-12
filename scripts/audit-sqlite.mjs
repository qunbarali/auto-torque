import { readFile, stat } from 'node:fs/promises'
import { glob } from 'node:fs/promises'

const patterns = [
  ['ILIKE', /\bILIKE\b/i],
  ['DISTINCT ON', /\bDISTINCT\s+ON\b/i],
  ['REGEXP_REPLACE', /\bREGEXP_REPLACE\b/i],
  ['PostgreSQL cast', /::(?:text|numeric|integer|jsonb|uuid|timestamp|date|boolean)\b/i],
  ['JSONB type', /\bJSONB\b/i],
  ['ARRAY constructor', /\bARRAY\s*\[/i],
  ['UNNEST', /\bUNNEST\s*\(/i],
  ['DATE_TRUNC', /\bDATE_TRUNC\s*\(/i],
  ['TO_CHAR', /\bTO_CHAR\s*\(/i],
  ['TO_DATE', /\bTO_DATE\s*\(/i],
  ['AT TIME ZONE', /\bAT\s+TIME\s+ZONE\b/i],
  ['search_path', /\bSET\s+search_path\b/i],
  ['FOR UPDATE', /\bFOR\s+UPDATE\b/i],
  ['SKIP LOCKED', /\bSKIP\s+LOCKED\b/i],
  ['PostgreSQL FILTER syntax', /\bFILTER\s*\(\s*WHERE\b/i],
]

const forbiddenFiles = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
]
const roots = ['src', 'scripts', 'prisma', '.devcontainer', '.github/workflows']
const files = []
for (const root of roots) {
  for await (const file of glob(`${root}/**/*`, { withFileTypes: false })) files.push(file)
}
for (const file of ['package.json', 'prisma.config.ts', 'Dockerfile', 'docker-compose.yml', 'init-db.sh']) files.push(file)

const failures = []
let scannedFiles = 0
for (const file of [...new Set(files)]) {
  if (forbiddenFiles.some((p) => p.test(file)) || file === 'scripts/audit-sqlite.mjs') continue
  try {
    const info = await stat(file)
    if (!info.isFile()) continue
    scannedFiles += 1

    const source = await readFile(file, 'utf8')
    for (const [name, pattern] of patterns) {
      if (pattern.test(source)) failures.push(`${file}: ${name}`)
    }
  } catch (error) {
    failures.push(`${file}: could not inspect file (${error instanceof Error ? error.message : String(error)})`)
  }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
for (const [name, value] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.overrides })) {
  if (/pg|postgres/i.test(name) || /postgres/i.test(String(value))) failures.push(`package.json: PostgreSQL dependency ${name}`)
}

const schema = await readFile('prisma/schema.prisma', 'utf8')
if (!/datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/s.test(schema)) failures.push('prisma/schema.prisma: datasource provider is not sqlite')

const prismaConfig = await readFile('prisma.config.ts', 'utf8')
if (!/migrations:\s*\{[^}]*path:\s*["']prisma\/migrations-sqlite["']/s.test(prismaConfig)) failures.push('prisma.config.ts: active migration path is not migrations-sqlite')

if (failures.length) {
  console.error('SQLite-only audit failed:')
  console.error([...new Set(failures)].join('\n'))
  process.exit(1)
}
console.log(`SQLite-only audit passed (${scannedFiles} source files scanned).`)
