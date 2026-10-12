# Local SQLite setup

Auto Torque is configured to use **SQLite** for local development and desktop builds. No PostgreSQL install is required.

## 1. Environment

```bat
copy .env.example .env
```

Edit `.env` and set a long `BETTER_AUTH_SECRET`. Keep:

```env
DATABASE_URL="file:./data/auto_torque.sqlite"
```

## 2. Install native deps and generate client

```bat
npm install
npx prisma generate
```

`better-sqlite3` is a native module; on Windows you may need build tools if install fails:

- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with “Desktop development with C++”, **or**
- Use an existing Node LTS that provides prebuilds.

## 3. Create tables

Use the Prisma SQLite schema with schema push:

```bat
npx prisma db push
```

## 4. Run

```bat
npm run dev
```

or

```bat
npm run tauri:dev
```

The database file lives at `data/auto_torque.sqlite` (gitignored).

## Optional: demo data

```bat
npm run seed:demo
```

## Production / Docker

Docker Compose and Tauri 2 both use the same SQLite database model. Server-hosted installs persist the SQLite file on a mounted data volume.
