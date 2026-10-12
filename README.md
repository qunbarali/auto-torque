# Auto Torque

Auto Torque is a workshop-management application for automotive service businesses. It brings customer and vehicle records, service jobs, quotes and invoices, parts inventory, inspections, reminders, tire storage, reporting, and technician workflows into one application.

The application is built with Next.js, React, TypeScript, Prisma, and SQLite. It can run as a web application or as a Windows/macOS/Linux desktop application using Tauri 2. Desktop production builds bundle a standalone Next.js server and Node runtime because the app uses server-side routes, server actions, database access, and WebSockets; it is not a static-export application.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment configuration](#environment-configuration)
- [Database](#database)
- [Desktop builds](#desktop-builds)
- [Quality checks](#quality-checks)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security and data handling](#security-and-data-handling)
- [User guide](docs/USER_GUIDE.md)
- [Code audit findings and verification gaps](docs/CODE_AUDIT.md)

## Features

Feature availability can depend on the deployment mode, account role, organization configuration, and plan.

- Customer and vehicle records, vehicle history, service notes, fuel logs, and reminders.
- Service records/work orders, labor and parts, attachments, findings, and payment records.
- Quotes, recurring invoices, inspections, and customer-facing service/quote flows.
- Parts inventory and stock movements.
- Tire storage / tire hotel, tire sets, measurements, locations, and treatments.
- Technician accounts and mobile-facing technician API.
- Organization membership, role/permission controls, invitations, and audit logs.
- Dashboard widgets, reports, notifications, and scheduled messages.
- Optional integrations for email, payments, messaging, AI, and other external services when configured.

## Requirements

For web development:

- Node.js 20 or newer (Node.js 22 is used by the CI workflow).
- npm.
- A supported operating system for Node.js and the required native dependencies.

For a Tauri desktop build, also install Rust (rustup) and the platform-specific prerequisites documented by [Tauri](https://v2.tauri.app/start/prerequisites/). Native dependencies may be required for SQLite's `better-sqlite3` package.

## Quick start

1. Clone the repository and enter its directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file:

   **PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

4. Replace `BETTER_AUTH_SECRET` with a unique random secret of at least 32 characters. Review the other settings in [Environment configuration](#environment-configuration).
5. Generate the Prisma client and create/update the local SQLite schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

The first registered user is promoted to super administrator by the current authentication hooks. On a shared or internet-accessible deployment, review registration settings and reverse-proxy access before making the service public.

> This repository currently does not commit an npm lockfile. Use `npm install` for dependency installation. For repeatable production releases, generate and commit the lockfile after dependency versions have been reviewed and tested.

## Environment configuration

The repository includes `.env.example`. Important settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite database URL. The example uses `file:./data/auto_torque.sqlite`. |
| `BETTER_AUTH_SECRET` | Private authentication/session secret. Use a unique random value of at least 32 characters; never commit the real secret. |
| `NEXT_PUBLIC_APP_URL` | Canonical application URL used by the application and authentication callbacks. |
| `TRUST_CF_CONNECTING_IP` | Set to `true` only when every request is forced through Cloudflare and direct origin access is blocked. Otherwise keep `false`. |

Optional integration settings are read by their corresponding modules. Configure only integrations you intend to use, and keep provider credentials server-side. Check the relevant settings screen and source module before deploying an integration.

## Database

- Prisma schema: `prisma/schema.prisma`.
- Default database: SQLite.
- Generate client: `npm run db:generate`.
- Push the current schema to the configured database: `npm run db:push`.
- Open Prisma Studio: `npm run db:studio`.
- Run SQLite compatibility checks: `npm run audit:sqlite`.
- Validate the Prisma schema and SQLite constraints: `npm run db:check`.

Back up the database and uploaded files before upgrading or changing the schema. `db:push` changes the schema in place; do not run it against a valuable production database without a verified backup and a planned maintenance window.

For Tauri release builds, the bundled database seed is copied into the operating system's writable application-data directory on first launch. The runtime log is also written under that app-data directory as `runtime.log`. Do not delete the database or its directory unless you have a verified backup and intend to reset local data.

## Desktop builds

The desktop application uses Tauri 2 to host the full Next.js server in a native window. It is not built as a static HTML export.

### Development

```bash
npm install
npm run tauri:dev
```

This starts the Next.js development server and opens the Tauri window at `http://localhost:3000`.

### Production package

Run:

```bash
npm run tauri:build
```

Tauri's configured `beforeBuildCommand` runs the Next.js production build and prepares the sidecar runtime. The preparation script copies the standalone server and static/public assets, prepares the SQLite seed, and stages the platform-specific Node executable. The Rust host starts the server locally before navigating the WebView to it.

Build on the target operating system when possible; native Node modules and Tauri bundling depend on platform-specific tooling. Test the actual installed package, not just the development server.

### Blank window or startup failure

1. Close Auto Torque and relaunch it once.
2. Find the Tauri application-data directory for the current OS and inspect `runtime.log`.
3. Look for missing `runtime/server.js`, sidecar launch errors, database initialization failures, or an HTTP readiness timeout.
4. Verify that the bundled package contains the runtime server, static assets, SQLite seed, and matching Node sidecar.
5. Rebuild with `npm run tauri:build` and test the resulting installer/package.

The packaged server binds to loopback; do not expose it to the public network.

## Same-Wi-Fi access (one shared database)

Auto Torque does not replicate/merge two independent SQLite databases over Wi-Fi. For two devices to work on the same records, run one Auto Torque server as the **LAN host** and connect the other device to that host in its browser. Both devices then use the same server and database; there is no background database-copy process.

For a packaged Tauri desktop host, LAN mode is opt-in and loopback-only remains the default.

1. Connect both devices to the same trusted private Wi-Fi network. Do not use a guest/public network.
2. Find the host computer's private IPv4 address (for example, `192.168.1.20`) with `ipconfig` on Windows. Reserve that address in the router so it does not change.
3. Allow inbound TCP port 3000 on the host firewall for the **Private** network profile only. Do not create a public-network firewall rule or expose this port to the internet.
4. Launch the packaged desktop host with these environment variables set in the launching process (PowerShell example; replace the address with the host's actual reserved IPv4 address):

   ```powershell
   $env:AUTO_TORQUE_LAN_HOST = "true"
   $env:AUTO_TORQUE_LAN_ORIGINS = "http://192.168.1.20:3000"
   Start-Process "C:\\Path\\To\\Auto Torque.exe"
   ```

   The server refuses to start in LAN mode if the explicit origin list is empty. Origins are exact HTTP(S) origins, comma-separated; wildcards and paths are not accepted. These variables must be present in the environment that launches the packaged Tauri executable; setting them only in a `.env` file does not configure the Rust host process.
5. On the second device, open `http://192.168.1.20:3000` in a browser and sign in using the existing account. Do not install another standalone copy expecting its separate local database to sync.
6. Create a test customer on one device, then refresh/search for it on the other. Only begin real use after this round-trip test succeeds.

**Security and limitations:** LAN mode binds the server to network interfaces, so the host's firewall and Wi-Fi trust boundary matter. HTTP does not encrypt traffic; use only on a trusted network and use HTTPS for sensitive or untrusted networks. Keep the host computer awake and Auto Torque running while clients need access. If the host stops or leaves Wi-Fi, other devices cannot reach the shared records. Make backups of the host database and uploaded files. Never copy the live SQLite database between devices as a sync method.

For a Node/web development server, `npm run dev` already binds to `0.0.0.0`; set `AUTO_TORQUE_LAN_ORIGINS` to the exact client origin in the environment before starting it. The same shared-server model applies.

## Quality checks

Run these locally before proposing a release:

```bash
npm run typecheck
npm run lint
npm test
npm run db:check
npm run build
```

For desktop changes, also run:

```bash
npm run tauri:build
```

A command is only verified when it has actually completed successfully on the target environment. The presence of a script or CI step is not proof that the build passes.

## Project structure

| Path | Purpose |
|---|---|
| `src/app` | Next.js routes, pages, API handlers, and server actions. |
| `src/components` | Shared UI and feature components. |
| `src/lib` | Authentication, database access, permissions, business logic, and integrations. |
| `prisma/schema.prisma` | Database models and relations. |
| `prisma` | Database seed and migration-related files. |
| `scripts` | Build preparation and database/SQLite audit utilities. |
| `src-tauri` | Tauri configuration, Rust host, capabilities, and bundled runtime staging. |
| `docs` | Architecture and user documentation. |

## Security and data handling

- Use HTTPS behind a correctly configured reverse proxy for public deployments.
- Use a unique `BETTER_AUTH_SECRET`; do not put secrets in client-side `NEXT_PUBLIC_*` variables.
- Keep the database, uploads, and backups protected by operating-system permissions.
- Review role/permission assignments and restrict public registration on production deployments.
- Only trust proxy headers when the deployment guarantees the request came through that proxy.
- Verify backups and restore procedures periodically.
- Treat logs and audit records as potentially sensitive; protect them accordingly.

## License

This project declares the Elastic License 2.0 in `package.json`. Read the repository's license terms before redistributing or offering the software as a service.
