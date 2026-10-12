import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { getAppDataDir } from '@/lib/app-data-path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveSqliteUrl(): string {
  const raw = process.env.DATABASE_URL?.trim()
  if (raw && raw.startsWith('file:')) {
    // Resolve relative file: paths against process.cwd() for Windows reliability
    const withoutScheme = raw.slice('file:'.length)
    if (withoutScheme.startsWith('./') || withoutScheme.startsWith('../')) {
      const abs = path.resolve(/*turbopackIgnore: true*/ process.cwd(), withoutScheme)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      return `file:${abs.replace(/\\/g, '/')}`
    }
    return raw
  }
  const root = getAppDataDir()
  const preferred = path.join(root, 'auto_torque.sqlite')
  const legacy = path.join(root, 'torqvoice.sqlite')
  // Keep existing installations/data intact while moving the default filename
  // to the new Auto Torque branding.
  const filePath = fs.existsSync(preferred) || !fs.existsSync(legacy) ? preferred : legacy
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  return `file:${filePath.replace(/\\/g, '/')}`
}

function sqliteFilePath(url: string): string {
  const raw = url.slice('file:'.length)
  return decodeURIComponent(raw.split('?')[0])
}

function configureSqlite(url: string) {
  const database = new Database(sqliteFilePath(url))
  // Desktop workloads are read-heavy and may have several concurrent API
  // requests. WAL keeps readers non-blocking while writers serialize briefly.
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 10000')
  database.pragma('temp_store = MEMORY')
  database.pragma('cache_size = -20000')
  database.close()
}

function createPrismaClient() {
  const url = resolveSqliteUrl()
  configureSqlite(url)
  const adapter = new PrismaBetterSqlite3({ url, timeout: 10_000 })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

globalForPrisma.prisma = db
