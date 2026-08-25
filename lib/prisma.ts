import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Connect Turso on Vercel: turso db tokens create qsis-arms');
  }
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN || '',
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Check if the database is configured and reachable. */
export async function isDbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err).toLowerCase();
      const isTransient = msg.includes('timeout') || msg.includes('connection') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('server closed') || msg.includes('pool') || msg.includes('unavailable') || msg.includes('overloaded');
      if (!isTransient || i === retries) throw err;
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastError;
}
