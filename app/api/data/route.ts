import { sql } from "@/lib/db";
import { ApiError, errorResponse, requireUser } from "@/lib/openai";
import type { Progress } from "@/lib/types";

/**
 * All reads and writes of the student's data. Stands in for row-level security:
 * every statement is scoped to the signed-in user, and foreign keys a request
 * sets must point at rows that user owns.
 */

type Table = "exams" | "subjects" | "lessons" | "own_cards";

const TABLES: Record<Table, { select: string; order: string; cols: string[]; json?: string[]; parents?: Record<string, Table> }> = {
  exams: {
    // date as text: the driver would otherwise turn it into a timezone-shifted Date
    select: "id, name, exam_date::text as exam_date, question_count, created_at",
    order: "created_at",
    cols: ["name", "exam_date", "question_count"],
  },
  subjects: {
    select: "id, exam_id, name, hint, color, position, created_at",
    order: "position",
    cols: ["exam_id", "name", "hint", "color", "position"],
    parents: { exam_id: "exams" },
  },
  lessons: {
    select: "id, exam_id, subject_id, name, goals, cards, findings, source, created_at",
    order: "created_at",
    cols: ["exam_id", "subject_id", "name", "goals", "cards", "findings", "source"],
    json: ["goals", "cards", "findings", "source"],
    parents: { exam_id: "exams", subject_id: "subjects" },
  },
  own_cards: {
    select: "id, lesson_id, goal, question, answer_html, answer_raw, source, replaces, created_at",
    order: "created_at",
    cols: ["lesson_id", "goal", "question", "answer_html", "answer_raw", "source", "replaces"],
    parents: { lesson_id: "lessons" },
  },
};

const PG_CLIENT_ERRORS: Record<string, number> = { "23503": 409, "23505": 409, "23514": 400, "22P02": 400, "22007": 400, "22008": 400 };

export async function GET() {
  try {
    const user = await requireUser();
    const db = sql();
    const all = (t: Table) => db.query(`select ${TABLES[t].select} from ${t} where user_id = $1 order by ${TABLES[t].order}`, [user.id]);
    const [exams, subjects, lessons, own, progress] = await Promise.all([
      all("exams"), all("subjects"), all("lessons"), all("own_cards"),
      db.query("select lesson_id, mastered, first_try, last_studied_at from progress where user_id = $1", [user.id]),
    ]);
    return Response.json({ email: user.email, exams, subjects, lessons, own, progress });
  } catch (e) {
    return dataError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new ApiError(400, "bad_request", "Ongeldig verzoek.");

    if (body.op === "progress") return Response.json(await saveProgress(user.id, body.progress as Progress));

    const table = body.table as Table;
    if (!Object.hasOwn(TABLES, table)) throw new ApiError(400, "bad_request", "Onbekende tabel.");
    const spec = TABLES[table];
    const id = typeof body.id === "string" ? body.id : null;
    const db = sql();

    if (body.op === "remove") {
      if (!id) throw new ApiError(400, "bad_request", "id ontbreekt.");
      await db.query(`delete from ${table} where id = $1 and user_id = $2`, [id, user.id]);
      return Response.json({ ok: true });
    }

    const row = pick(spec, body.row);
    await checkParents(user.id, spec.parents, row);
    const cols = Object.keys(row);
    const values = cols.map((c) => row[c]);

    if (body.op === "insert") {
      const placeholders = cols.map((_, i) => `$${i + 2}`);
      const [inserted] = await db.query(
        `insert into ${table} (user_id${cols.map((c) => `, ${c}`).join("")}) values ($1${placeholders.map((p) => `, ${p}`).join("")}) returning ${spec.select}`,
        [user.id, ...values],
      );
      return Response.json(inserted);
    }

    if (body.op === "update") {
      if (!id) throw new ApiError(400, "bad_request", "id ontbreekt.");
      if (!cols.length) return Response.json({ ok: true });
      const sets = cols.map((c, i) => `${c} = $${i + 3}`).join(", ");
      await db.query(`update ${table} set ${sets} where id = $1 and user_id = $2`, [id, user.id, ...values]);
      return Response.json({ ok: true });
    }

    throw new ApiError(400, "bad_request", "Onbekende actie.");
  } catch (e) {
    return dataError(e);
  }
}

/** Keep only known columns; jsonb values are sent as JSON text (the driver would turn arrays into Postgres arrays). */
function pick(spec: (typeof TABLES)[Table], raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "bad_request", "Ongeldige gegevens.");
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!spec.cols.includes(k)) throw new ApiError(400, "bad_request", `Onbekend veld: ${k}`);
    row[k] = spec.json?.includes(k) && v != null ? JSON.stringify(v) : v;
  }
  return row;
}

async function checkParents(userId: string, parents: Record<string, Table> | undefined, row: Record<string, unknown>) {
  for (const [col, parent] of Object.entries(parents ?? {})) {
    const pid = row[col];
    if (pid == null) continue;
    const found = await sql().query(`select 1 from ${parent} where id = $1 and user_id = $2`, [pid, userId]);
    if (!found.length) throw new ApiError(404, "not_found", "Niet gevonden.");
  }
}

async function saveProgress(userId: string, p: Progress) {
  if (!p || typeof p.lesson_id !== "string" || !Array.isArray(p.mastered) || typeof p.first_try !== "object")
    throw new ApiError(400, "bad_request", "Ongeldige voortgang.");
  await checkParents(userId, { lesson_id: "lessons" }, p as unknown as Record<string, unknown>);
  await sql().query(
    `insert into progress (user_id, lesson_id, mastered, first_try, last_studied_at) values ($1, $2, $3, $4, $5)
     on conflict (user_id, lesson_id) do update set mastered = excluded.mastered, first_try = excluded.first_try, last_studied_at = excluded.last_studied_at`,
    [userId, p.lesson_id, p.mastered.map(String), JSON.stringify(p.first_try ?? {}), p.last_studied_at],
  );
  return { ok: true };
}

function dataError(e: unknown) {
  const code = (e as { code?: unknown })?.code;
  if (!(e instanceof ApiError) && typeof code === "string" && code in PG_CLIENT_ERRORS)
    return Response.json({ code, message: "De database weigerde deze wijziging." }, { status: PG_CLIENT_ERRORS[code] });
  if (e instanceof ApiError) return errorResponse(e);
  console.error(e);
  return Response.json({ code: "db_error", message: "Er ging iets mis met de database." }, { status: 500 });
}
