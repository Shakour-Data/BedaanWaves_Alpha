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
  db.$executeRaw`PRAGMA journal_mode = WAL;`
  db.$executeRaw`PRAGMA synchronous = NORMAL;`
  db.$executeRaw`PRAGMA cache_size = -32768;`
  db.$executeRaw`PRAGMA temp_store = MEMORY;`
  db.$executeRaw`PRAGMA mmap_size = 268435456;`
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db