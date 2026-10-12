import fs from 'node:fs'
import path from 'node:path'

/**
 * Writable application data root.
 *
 * Web/self-hosted mode keeps the historical ./data directory. Tauri release
 * builds set AUTO_TORQUE_DATA_DIR to the OS application-data directory so the
 * packaged resources stay read-only and user data survives app updates.
 */
export function getAppDataDir(): string {
  const configured = process.env.AUTO_TORQUE_DATA_DIR?.trim()
  const root = configured ? path.resolve(configured) : path.resolve(process.cwd(), 'data')
  fs.mkdirSync(root, { recursive: true })
  return root
}

export function getUploadsDir(...segments: string[]): string {
  const dir = path.join(getAppDataDir(), 'uploads', ...segments)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

