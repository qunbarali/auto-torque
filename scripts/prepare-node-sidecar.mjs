import { cp, mkdir, readdir, rm, chmod, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const binaries = path.join(root, 'src-tauri', 'binaries')
const runtime = path.join(root, 'src-tauri', 'runtime')
const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || detectHostTriple()
const suffix = process.platform === 'win32' ? '.exe' : ''
const nodeName = `auto-torque-node-${targetTriple}${suffix}`
const nodeTarget = path.join(binaries, nodeName)

await mkdir(binaries, { recursive: true })
// Tauri validates configured resource globs even during `tauri dev`. The
// production runtime is created by `tauri:prepare`; provide a harmless file
// so the `runtime/**` resource glob also resolves on a clean development tree.
await mkdir(runtime, { recursive: true })
// Tauri's globber may ignore dotfiles, so use a visible placeholder filename.
// Keep it out of production: prepare-tauri-runtime.mjs recreates this directory.
if (!runtimeEntriesContainServer(await readdir(runtime))) {
  await writeFile(path.join(runtime, 'dev-resource-placeholder.txt'), 'Generated for Tauri development resource validation.\n', 'utf8')
}
for (const entry of await readdir(binaries)) {
  if (entry.startsWith('auto-torque-node-') && entry !== nodeName) {
    await rm(path.join(binaries, entry), { force: true })
  }
}
await cp(process.execPath, nodeTarget)
if (process.platform !== 'win32') await chmod(nodeTarget, 0o755)

console.log(`Prepared Tauri Node sidecar: ${nodeTarget}`)

function runtimeEntriesContainServer(entries) {
  return entries.includes('server.js')
}

function detectHostTriple() {
  try {
    const output = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    const host = output.match(/^host:\s*(\S+)/m)?.[1]
    if (!host) throw new Error('rustc did not report a host target triple')
    return host
  } catch (error) {
    throw new Error(`Cannot determine Rust host target for Node sidecar: ${error instanceof Error ? error.message : String(error)}`)
  }
}
