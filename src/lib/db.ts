import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// Apply SQLite pragmas for performance
if (process.env.NODE_ENV === 'production') {
  void db.$executeRaw`PRAGMA journal_mode = WAL;`;
  void db.$executeRaw`PRAGMA synchronous = NORMAL;`;
  void db.$executeRaw`PRAGMA cache_size = -32768;`;
  void db.$executeRaw`PRAGMA temp_store = MEMORY;`;
  void db.$executeRaw`PRAGMA mmap_size = 268435456;`;
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db