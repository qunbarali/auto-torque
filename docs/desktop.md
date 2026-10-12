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

The production flow is fully wired for the SQLite + Tauri 2 architecture:

1. `npm run build` creates the Next.js standalone server.
2. `npm run tauri:prepare` copies the standalone runtime, creates a schema seed, and packages the Node executable used for the current build target as a Tauri sidecar.
3. `npm run tauri:build` bundles the app, server, SQLite seed, and Node sidecar.

The packaged app keeps its SQLite database and uploads in the OS application-data directory, not inside the read-only Tauri resources.

## Icons

The packaged application uses the Auto Torque gear/wrench branding in PNG, ICO and ICNS formats. `scripts/prepare-tauri-runtime.mjs` also prepares the platform-specific Node sidecar required by Tauri 2 production builds.

## Database & offline behavior

Auto Torque uses SQLite through Prisma + `better-sqlite3`. Tauri release builds create a schema-only seed on build and copy it to the user's writable application-data directory on first launch. The runtime enables WAL, foreign keys, a busy timeout, normal synchronous mode, memory temp storage, and a bounded page cache for responsive desktop workloads.

## Capabilities & security

Default capabilities are defined in `src-tauri/capabilities/default.json`. Only the minimal permissions required for the shell plugin are enabled. Expand the ACL as you add more native features (file system, notifications, etc.).

## Troubleshooting

- **Window stays blank** – make sure `next dev` is reachable at `http://localhost:3000` and that no firewall is blocking it.
- **Rust version too old** – update with `rustup update`.
- **Missing system libraries (Linux)** – install the packages listed in the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).
