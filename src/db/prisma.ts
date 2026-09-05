import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env, isProduction } from "../config/env";

// Prisma 7 no longer ships a Rust query engine: queries go through a driver
// adapter. `@prisma/adapter-pg` wraps node-postgres (`pg`), which works with
// any standard Postgres connection string (Neon, local, etc.) and manages its
// own connection pool.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

// Avoid exhausting the DB connection pool from hot-reloads in dev by reusing
// a single instance across module reloads.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? createPrismaClient();

if (!isProduction) {
  global.__prisma = prisma;
}
