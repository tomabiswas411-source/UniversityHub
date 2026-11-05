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

 // Fallback: local SQLite file (development). In production the FS is
 // ephemeral — writes would silently vanish per invocation, so refuse to
 // boot on a misconfigured deployment instead of serving a fake DB.
 if (process.env.NODE_ENV === "production") {
 throw new Error(
 "[db] TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not configured — refusing to fall back to ephemeral local SQLite in production"
 );
 }
 console.warn(
 "[db] TURSO env vars not set — falling back to local SQLite file (dev only)."
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
