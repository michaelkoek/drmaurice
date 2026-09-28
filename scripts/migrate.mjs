// Applies db/migrations/*.sql in order. Run once on a fresh Neon database: npm run db:migrate
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const f of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(`db/migrations/${f}`, "utf8"));
    console.log(`✓ ${f}`);
  }
} finally {
  await pool.end();
}
