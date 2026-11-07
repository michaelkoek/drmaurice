// Applies db/migrations/*.sql that have not run yet, in order: npm run db:migrate
// Applied files are recorded in _migrations, so running it again is a no-op.
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows: [{ tracked }] } = await pool.query(`select to_regclass('_migrations') is not null as tracked`);
  if (!tracked) {
    await pool.query(`create table _migrations (name text primary key, applied_at timestamptz not null default now())`);
    // databases set up before tracking existed already ran 001
    const { rows: [{ legacy }] } = await pool.query(`select to_regclass('"user"') is not null as legacy`);
    if (legacy) await pool.query(`insert into _migrations (name) values ('001_init.sql')`);
  }
  const done = new Set((await pool.query(`select name from _migrations`)).rows.map((r) => r.name));
  for (const f of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(readFileSync(`db/migrations/${f}`, "utf8"));
      await client.query(`insert into _migrations (name) values ($1)`, [f]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    console.log(`✓ ${f}`);
  }
  console.log("Database is bijgewerkt.");
} finally {
  await pool.end();
}
