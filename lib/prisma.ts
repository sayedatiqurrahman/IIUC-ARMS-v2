import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Retry helper for transient DB errors (CockroachDB Serverless cold starts, etc.)
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err).toLowerCase();
      const isTransient = msg.includes('timeout') || msg.includes('connection') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('server closed') || msg.includes('pool') || msg.includes('unavailable');
      if (!isTransient || i === retries) throw err;
      // Brief pause before retry (200ms, 500ms)
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastError;
}
