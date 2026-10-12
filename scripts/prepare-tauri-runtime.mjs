import { cp, mkdir, rm, chmod } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const standalone = path.join(root, '.next', 'standalone')
const staticDir = path.join(root, '.next', 'static')
const publicDir = path.join(root, 'public')
const runtime = path.join(root, 'src-tauri', 'runtime')
const binaries = path.join(root, 'src-tauri', 'binaries')

if (!existsSync(path.join(standalone, 'server.js'))) {
  throw new Error('Next standalone server.js was not generated. Run `npm run build` first.')
}

await rm(runtime, { recursive: true, force: true })
await mkdir(runtime, { recursive: true })
await cp(standalone, runtime, { recursive: true })
await mkdir(path.join(runtime, '.next'), { recursive: true })
await cp(staticDir, path.join(runtime, '.next', 'static'), { recursive: true })
if (existsSync(publicDir)) await cp(publicDir, path.join(runtime, 'public'), { recursive: true })

// Build a schema-only SQLite template. The packaged desktop app copies this
// into the user's writable app-data directory on first launch.
const seed = path.join(runtime, 'seed.sqlite')
await rm(seed, { force: true })
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'db', 'push', '--skip-generate'], {
  cwd: root,
  stdio: 'inherit',
  // Windows cannot execute .cmd files directly through execFileSync without a shell.
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: `file:${seed.replace(/\\/g, '/')}` },
})

// Tauri 2 must not depend on a system Node installation after packaging.
// Reuse the Node executable that is running this preparation script as the
// per-platform sidecar. Each platform's release should be built on that
// platform so the bundled binary matches its target ABI.
const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || detectHostTriple()
const nodeSource = process.execPath
const nodeName = process.platform === 'win32' ? `auto-torque-node-${targetTriple}.exe` : `auto-torque-node-${targetTriple}`
await mkdir(binaries, { recursive: true })
for (const entry of await import('node:fs/promises').then((m) => m.readdir(binaries))) {
  if (entry.startsWith('auto-torque-node-')) await rm(path.join(binaries, entry), { force: true })
}
const nodeTarget = path.join(binaries, nodeName)
await cp(nodeSource, nodeTarget)
if (process.platform !== 'win32') await chmod(nodeTarget, 0o755)

console.log(`Prepared Tauri runtime, SQLite seed, and Node sidecar for ${targetTriple}`)

function detectHostTriple() {
  try {
    return execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host:\s*(\S+)/m)?.[1] || 'unknown-target'
  } catch {
    return 'unknown-target'
  }
}
