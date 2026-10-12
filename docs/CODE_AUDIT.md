# Code Audit Notes

**Branch:** `fix/production-blank-screen-2026-10-12`  
**Status:** In progress — not a release certification.

This report records the concrete issues found and changes made during the current remote inspection. The repository is a large Next.js/Tauri application with many feature modules; the checks below are not a claim that every line of every file has already been executed or exhaustively reviewed.

## Findings addressed

| Area | Finding | Change |
|---|---|---|
| Tauri production startup | A listening TCP port alone does not prove the bundled Next.js app is ready; production UI could open before HTTP readiness. | Added an HTTP readiness probe, a bounded startup wait, sidecar diagnostics, database/resource-path logging, and a persistent runtime log. |
| Tauri frontend configuration | The window configuration could force a URL in a way that obscured the intended production frontend target. | Made the production frontend target explicit and removed the per-window URL override. |
| Tauri permissions | The frontend had broad shell-spawn permission even though Rust launches the bundled server. | Removed the unnecessary frontend spawn permission. |
| Windows build scripts | Prisma CLI invocation via `execFileSync` can fail on Windows when the executable resolves to a `.cmd` shim. | Set the shell option on Windows in the two Prisma preparation scripts. |
| TypeScript verification | There was no explicit project typecheck script in package scripts/CI. | Added `npm run typecheck` and a CI step. |
| CI dependency install | CI used `npm ci` without a committed npm lockfile. | Switched to `npm install --no-audit --no-fund` and removed lockfile-dependent npm cache setup. A committed lockfile remains recommended for reproducible releases. |
| SQLite audit script | File-inspection errors were swallowed, allowing an incomplete scan to appear successful. | Report inspection failures and count files actually scanned. |
| Authentication audit metadata | Failed-login audit IP parsing trusted `cf-connecting-ip` without checking the proxy trust setting and used a caller-controllable first `x-forwarded-for` entry. | Trust Cloudflare's header only when `TRUST_CF_CONNECTING_IP=true`; avoid taking the first forwarded entry. |
| Server-action audit metadata | Audit logs used the first `x-forwarded-for` value, inconsistent with the rate limiter's proxy trust policy. | Align audit metadata with the configured Cloudflare trust setting and the reverse-proxy appended address convention. |
| Organization switch button | The client ignored the server action's `{ success: false, error }` result, so a failed switch could appear to succeed. | Check the result, surface errors, and refresh only after success. |
| Organization creation button | An exception could leave the create button stuck in its loading state. | Add exception feedback and reset loading state in `finally`. |
| Sign-out button | A thrown sign-out failure was not surfaced. | Catch failures and show a toast. |
| Notification read/delete controls | Local state changed before the backend confirmed the action; failures could make notifications look read/deleted when they were not. | Await server actions, update local state only on success, and report errors. |
| Notification keyboard behavior | Pressing Enter on a nested notification control could bubble to the row and trigger navigation. | Restrict row keyboard activation to events originating on the row itself and support Enter/Space. |
| Desktop documentation | Build instructions repeated the build/preparation steps even though Tauri's `beforeBuildCommand` already runs them. Packaged-startup troubleshooting was incomplete. | Corrected the build sequence and documented the runtime log. |
| Project documentation | The README was effectively empty and there was no end-user guide. | Added a project README and a user/admin guide. |

## Button-to-action trace performed in this pass

| UI control | Expected behavior / backend link | Current review |
|---|---|---|
| Sidebar navigation links | Navigate to the corresponding route; no mutation backend is expected. | Link targets and access-filter inputs reviewed in `src/components/app-sidebar.tsx`. |
| Switch organization | Calls `switchOrganization`; server verifies session and organization membership before writing the active-organization cookie. | Client now handles returned errors and exceptions. |
| Create organization | Calls `createNewOrganization`; server validates input, checks demo/cloud plan constraints, creates organization and owner membership in a transaction, and updates the active-org cookie. | Client now resets pending state reliably and surfaces failures. |
| Sign out | Calls Better Auth's `signOut` client action and navigates to sign-in. | Exception feedback added. |
| Theme selection | Updates theme preference through the theme provider. | Client-side preference action; no business-record backend mutation expected. |
| Locale selection | Calls `setLocale` then refreshes the route. | Client/server action wiring inspected; not runtime-tested. |
| Fullscreen toggle | Uses the browser Fullscreen API and device-local preference. | Browser API action; no backend mutation expected. |
| Install app / dismiss install prompt | Uses the browser install prompt and local device preference. | Browser API action; platform availability varies by browser. |
| Notification mark-read / mark-all-read / delete | Calls organization-scoped server actions backed by Prisma. | Changed to wait for successful backend results before updating local store. |
| Notification row | Marks unread notifications read and navigates to the entity URL. | Backend result is checked; nested keyboard activation corrected. |

## Verification that remains outstanding

The connected GitHub inspection tool allowed source changes and file-level review, but the environment could not clone the repository to run its actual toolchain. Therefore these have **not** been verified by execution:

- `npm install` dependency resolution on a clean machine.
- `npm run typecheck`.
- `npm run lint` / `npm run check`.
- `npm test`.
- `npm run db:check`.
- `npm run build`.
- `npm run tauri:build`, Rust compilation, and launch of the packaged Windows application.
- End-to-end browser tests for every button across every feature page, role, and error state.

The CI workflow was not triggered. `main` was not changed.

## Recommended release gate

1. Install dependencies from a clean checkout and commit a reviewed npm lockfile.
2. Run typecheck, lint, tests, SQLite audit/schema validation, and Next production build.
3. Add automated tests for server actions and permission boundaries.
4. Add Playwright or equivalent end-to-end tests that exercise every create/edit/delete/export/share/send button and assert both UI feedback and persisted backend state.
5. Build and launch the Tauri package on Windows; test startup with a fresh data directory and with an existing database.
6. Verify backup/restore, organization isolation, failed integration credentials, and permission-denied paths.
7. Review the resulting logs and build artifacts before merging.
