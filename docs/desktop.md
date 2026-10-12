# Desktop builds with Tauri 2

Auto Torque can run as a native desktop application on Windows, macOS and Linux using [Tauri 2](https://v2.tauri.app/).

## Why a sidecar is required

Auto Torque is a full-stack Next.js application (App Router, server actions, Prisma, Better Auth, WebSockets via `next-ws`, API routes, cron tasks, file uploads, etc.).

The official Tauri + Next.js guide only supports **static export** (`output: 'export'`). That mode cannot run any server-side code, so it is unsuitable for this project.

Instead we use the **development mode** path for day-to-day work and prepare a **Node.js sidecar** approach for production desktop binaries.

| Mode | How it works |
|------|--------------|
| `tauri dev` | Starts `next dev` via `beforeDevCommand` and loads `http://localhost:3000` in the native window |
| Production build | Next.js is built in `standalone` mode. A Node runtime + the standalone server is shipped as a Tauri sidecar. Rust starts the server on a local port and points the WebView at it |

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (1.77 or newer recommended for Tauri 2)
- System dependencies for Tauri (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

```bash
# Install Tauri CLI (once) – also listed in package.json devDependencies
npm install -D @tauri-apps/cli@^2
# or
cargo install tauri-cli --version "^2.0.0"
```

## Development

```bash
# From the project root
npm install
cp .env.example .env   # set BETTER_AUTH_SECRET, etc. (SQLite is the default)

# Start the desktop app (Next.js dev server + native window)
npm run tauri:dev
# or
npx tauri dev
```

The native window opens and loads the same app you see in the browser at `http://localhost:3000`. Hot reload works as usual.

## Production build

The production flow is wired for the SQLite + Tauri 2 architecture. Run:

```bash
npm run tauri:build
```

Tauri invokes the configured `beforeBuildCommand`, which runs `npm run build` and then `npm run tauri:prepare` before bundling the app. Do not run those three commands manually in sequence unless you intentionally want to repeat the build/preparation work.

The packaged app keeps its SQLite database and uploads in the OS application-data directory, not inside the read-only Tauri resources.

## Optional same-Wi-Fi host mode

The packaged desktop app is loopback-only by default. For a second device to use the same records, start one desktop installation as the LAN host and connect other devices to it in a browser. This shares one server/database; it does not replicate separate SQLite databases.

On Windows, reserve the host's private IPv4 address in the router, then launch the packaged executable from PowerShell with exact origin configuration:

```powershell
$env:AUTO_TORQUE_LAN_HOST = "true"
$env:AUTO_TORQUE_LAN_ORIGINS = "http://192.168.1.20:3000"
Start-Process "C:\Path\To\Auto Torque.exe"
```

Replace the sample IP and executable path. The host process must inherit these variables; the Rust desktop launcher does not read `.env`. The server binds to `0.0.0.0` only when LAN mode is explicitly enabled and refuses to start in that mode if the origin list is empty. `AUTO_TORQUE_LAN_ORIGINS` is a comma-separated list of exact HTTP(S) origins; wildcard entries, paths, and malformed origins are ignored.

Allow TCP port 3000 through the host firewall only on a trusted **Private** network profile. On the main device, open **Settings → LAN devices** to prepare and save a QR code or copy the connection address. On the second device, use **Login as secondary device** and import the QR image or enter the address; this opens the main host's sign-in page. Sign in with the existing account. The QR is only a connection address, not an authentication token. For a native secondary desktop instance, set `AUTO_TORQUE_REMOTE_URL` before launching it. The Rust startup checks this setting before creating app-data files, copying the SQLite seed, or starting the sidecar, then navigates the window to the validated private LAN origin. Example: `$env:AUTO_TORQUE_REMOTE_URL = "http://192.168.1.20:3000"; Start-Process "C:\\Path\\To\\Auto Torque.exe"`. See the user guide for the helper script, validation limits, existing-local-data warning, and return-to-local steps. Direct QR-image import into native startup and one-time approved device pairing/revocation are not implemented yet. Keep the host running and back up its database and uploaded files.

**Security note:** LAN mode uses HTTP in this setup. Do not use it on public/guest Wi-Fi or an untrusted network because traffic is not encrypted. Use a properly configured HTTPS deployment for untrusted networks or sensitive production access. See [the user guide](USER_GUIDE.md#12-two-devices-on-the-same-wi-fi-shared-local-data) for the full setup and troubleshooting checklist.

## Icons

The packaged application uses the Auto Torque gear/wrench branding in PNG, ICO and ICNS formats. `scripts/prepare-tauri-runtime.mjs` also prepares the platform-specific Node sidecar required by Tauri 2 production builds.

## Database & offline behavior

Auto Torque uses SQLite through Prisma + `better-sqlite3`. Tauri release builds create a schema-only seed on build and copy it to the user's writable application-data directory on first launch. The runtime enables WAL, foreign keys, a busy timeout, normal synchronous mode, memory temp storage, and a bounded page cache for responsive desktop workloads.

## Capabilities & security

Default capabilities are defined in `src-tauri/capabilities/default.json`. Only the minimal permissions required for the shell plugin are enabled. Expand the ACL as you add more native features (file system, notifications, etc.).

## Troubleshooting

- **Development window stays blank** – make sure `next dev` is reachable at `http://localhost:3000` and that no firewall is blocking it.
- **Packaged window stays blank or exits during startup** – inspect `runtime.log` in the Tauri application-data directory. It records the bundled resource/data paths, sidecar output, database initialization errors, and HTTP readiness failures. Confirm the package contains `runtime/server.js`, its static assets, the SQLite seed, and the matching Node sidecar.
- **Rust version too old** – update with `rustup update`.
- **Missing system libraries (Linux)** – install the packages listed in the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).
