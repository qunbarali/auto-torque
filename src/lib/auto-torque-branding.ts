import { readFile } from 'fs/promises'
import { join } from 'path'

let cachedDataUri: string | undefined

export async function getAutoTorqueLogoDataUri(): Promise<string | undefined> {
  if (cachedDataUri) return cachedDataUri

  try {
    const publicRoot = process.env.AUTO_TORQUE_RUNTIME_DIR
      ? join(process.env.AUTO_TORQUE_RUNTIME_DIR, 'public')
      : join(process.cwd(), 'public')
    const logoPath = join(publicRoot, 'auto_torque_app_logo.png')
    const buffer = await readFile(logoPath)
    cachedDataUri = `data:image/png;base64,${buffer.toString('base64')}`
    return cachedDataUri
  } catch {
    return undefined
  }
}
