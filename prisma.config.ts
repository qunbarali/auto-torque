import "dotenv/config";
import { defineConfig } from "prisma/config";

// Keep the CLI portable; desktop runtime supplies an explicit writable path.
const defaultDatabaseUrl = "file:./data/auto_torque.sqlite";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations-sqlite",
  },
  datasource: {
    url: process.env.DATABASE_URL || defaultDatabaseUrl,
  },
});
