import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { FEEDBACK_KINDS } from "@/lib/feedback";
import { Panel } from "@/components/ui";

type Row = { id: string; kind: string; message: string; created_at: string; email: string };

/** Admin only (ADMIN_EMAILS): feedback inbox and paid-user count. */
export default async function AdminPage() {
  if (!isAdmin(await currentUser())) notFound();
  const db = sql();
  const [rows, [stats]] = await Promise.all([
    db.query(`select f.id, f.kind, f.message, f.created_at, u.email from feedback f join "user" u on u.id = f.user_id order by f.created_at desc limit 200`),
    db.query(`select (select count(*)::int from "user") as users, (select count(*)::int from "user" where "paidAt" is not null) as paid, (select count(*)::int from payments) as payments, (select coalesce(sum(amount), 0)::int from payments) as revenue`),
  ]);
  const feedback = rows as Row[];
  const label = (k: string) => FEEDBACK_KINDS.find((x) => x.id === k)?.label ?? k;
  const date = (d: string) => new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" });

  return (
    <main className="grid gap-5 py-4">
      <h1 className="font-display text-2xl font-bold">Beheer</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Accounts", stats.users],
          ["Met toegang", stats.paid],
          ["Betalingen", stats.payments],
          ["Omzet", `€${(stats.revenue / 100).toFixed(2).replace(".", ",")}`],
        ].map(([k, v]) => (
          <Panel key={k} className="p-4">
            <p className="text-[12px] text-muted">{k}</p>
            <p className="font-display text-2xl font-bold">{v}</p>
          </Panel>
        ))}
      </div>
      <section className="grid gap-3">
        <h2 className="font-display text-lg font-bold">Feedback ({feedback.length})</h2>
        {!feedback.length && <p className="text-[14px] text-muted">Nog geen feedback.</p>}
        {feedback.map((f) => (
          <Panel key={f.id} className="grid gap-1 p-4">
            <p className="text-[12px] text-muted">{date(f.created_at)} · {f.email} · <span className="font-semibold">{label(f.kind)}</span></p>
            {/* plain text: user input is never rendered as HTML */}
            <p className="whitespace-pre-wrap break-words text-[14px]">{f.message}</p>
          </Panel>
        ))}
      </section>
    </main>
  );
}
