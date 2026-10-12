# SQLite migrations

The active application database is SQLite and is provisioned from `prisma/schema.prisma` with `prisma db push`.

No PostgreSQL migration directory is shipped or applied by Auto Torque.

If a formal SQLite migration baseline is needed for a deployment pipeline, generate it from the current schema with:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/migrations-sqlite/00000000000000_baseline/migration.sql
```

Then review the generated SQL before using `prisma migrate deploy`.
