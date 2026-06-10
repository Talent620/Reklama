/**
 * Prisma client accessor (lazy).
 *
 * The client is constructed only on first use, so importing this module when no
 * database is configured is completely safe — nothing connects, nothing throws.
 * In development the instance is cached on globalThis to survive Next.js
 * hot-reload without exhausting connections.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Get (or lazily create) the shared Prisma client. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

/** True only when a database connection string is configured. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0);
}
