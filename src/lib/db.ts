import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForDb = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // Production path: connect to Turso (LibSQL) cloud database via driver adapter
  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: tursoToken,
    });
    return new PrismaClient({ adapter });
  }

  // Fallback: local SQLite file (development)
  console.warn(
    "[db] TURSO env vars not set — falling back to local SQLite file."
  );
  return new PrismaClient();
}

export const db: PrismaClient =
  globalForDb.prisma ??
  (() => {
    const client = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalForDb.prisma = client;
    }
    return client;
  })();
