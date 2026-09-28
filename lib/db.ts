import "server-only";
import { neon, Pool, type NeonQueryFunction } from "@neondatabase/serverless";

// created on first use so `next build` works without DATABASE_URL
let http: NeonQueryFunction<false, false> | null = null;
let pooled: Pool | null = null;

function url() {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL ontbreekt op de server.");
  return u;
}

/** One-shot queries over HTTP (app data). */
export function sql() {
  return (http ??= neon(url()));
}

/** Pooled connection for Better Auth (it needs a pg-compatible Pool). */
export function pool() {
  return (pooled ??= new Pool({ connectionString: url() }));
}
