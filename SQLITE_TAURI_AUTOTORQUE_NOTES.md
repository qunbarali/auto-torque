# Auto Torque — SQLite + Tauri 2 notes

## Database

- SQLite is the only active application datasource.
- Prisma 7.10.x + `@prisma/adapter-better-sqlite3` are aligned.
- Better Auth's Prisma adapter uses `provider: "sqlite"`.
- Runtime SQLite is configured for WAL, `synchronous=NORMAL`, foreign keys, a 10-second busy timeout, memory temp storage, and a bounded cache.
- No PostgreSQL migration directory is shipped; the active database is SQLite.
- `prisma/migrations-sqlite/` is the active migration path. The application currently provisions the schema with `prisma db push`; use `npm run db:baseline` if a formal migration baseline is required.

## Tauri 2

- Production uses Next.js standalone output.
- `scripts/prepare-tauri-runtime.mjs` copies the standalone runtime, static assets, public assets, creates a schema-only SQLite seed, and packages the current Node executable as a target-specific sidecar.
- Rust starts the Node sidecar on `127.0.0.1:3000` and waits for it before the window loads.
- `tauri dev` uses the same port as `next dev`, so development and production window routing stay consistent.
- User database and uploads live in the OS application-data directory via `AUTO_TORQUE_DATA_DIR`; packaged resources remain read-only.
- Auto Torque uses the gear/wrench orange branding across web, PWA, Tauri PNG/ICO/ICNS assets, PDFs, metadata, and auth screens.

## Legacy restore

The LubeLog/LiteDB restore endpoint scans the legacy BSON database, maps recognized records into Auto Torque entities, copies supported attachments, and preserves every source document in `LegacyImportRecord` so unmapped data is never silently discarded.
