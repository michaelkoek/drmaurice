-- Paid access (€5 once via Stripe) and in-app feedback.

-- ── Paywall ───────────────────────────────────────────────────────────────────
-- set by the Stripe webhook (or `npm run user -- grant`); null = has not paid
alter table "user" add column "paidAt" timestamptz;
-- everyone who had an account before the paywall keeps free access
update "user" set "paidAt" = now();

-- one row per completed Stripe Checkout session; the unique id makes webhook retries harmless
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  stripe_session_id text not null unique,
  amount integer not null,
  currency text not null,
  created_at timestamptz not null default now()
);
create index on payments (user_id);

-- ── Feedback ──────────────────────────────────────────────────────────────────
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('idee', 'probleem', 'anders')),
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on feedback (user_id, created_at);
