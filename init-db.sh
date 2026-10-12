#!/bin/sh
set -eu

# Auto Torque now uses SQLite. Keep database initialization in the container
# startup path so a brand-new volume never reaches Next.js with missing tables.
export DATABASE_URL="${DATABASE_URL:-file:./data/auto_torque.sqlite}"

case "$DATABASE_URL" in
  file:*)
    db_path="${DATABASE_URL#file:}"
    case "$db_path" in
      /*) mkdir -p "$(dirname "$db_path")" ;;
      *) mkdir -p "$(dirname "$PWD/$db_path")" ;;
    esac
    ;;
  *) echo "ERROR: DATABASE_URL must be a SQLite file: URL" >&2; exit 1 ;;
esac

# Adopt the previous Torqvoice filename when upgrading an existing volume.
if [ "$DATABASE_URL" = "file:/app/data/auto_torque.sqlite" ] && [ ! -f /app/data/auto_torque.sqlite ] && [ -f /app/data/torqvoice.sqlite ]; then
  cp /app/data/torqvoice.sqlite /app/data/auto_torque.sqlite
  [ ! -e /app/data/torqvoice.sqlite-wal ] || cp /app/data/torqvoice.sqlite-wal /app/data/auto_torque.sqlite-wal
  [ ! -e /app/data/torqvoice.sqlite-shm ] || cp /app/data/torqvoice.sqlite-shm /app/data/auto_torque.sqlite-shm
  echo "Adopted existing Torqvoice SQLite database as Auto Torque."
fi

echo "Preparing SQLite database..."
npx prisma db push --skip-generate

echo "SQLite database ready."

if ! node -e "require('sharp')" >/dev/null 2>&1; then
  echo "WARNING: sharp could not be loaded. Certificate images may be unavailable."
fi

exec "$@"
