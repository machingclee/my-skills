// Prisma 7 reads the connection here, not from schema.prisma. Only `prisma
// generate` / migrate use it — src/db/database.ts talks to Postgres through pg.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
