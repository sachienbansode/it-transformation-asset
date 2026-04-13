import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Prevent unhandled error crashes when DB severs a connection (e.g. on deployment)
pool.on("error", (err) => {
  console.error("[db-pool] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
