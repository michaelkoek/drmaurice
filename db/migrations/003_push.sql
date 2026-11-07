-- Web Push: one row per browser/device that turned on study reminders.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  -- the push service URL identifies the device; re-subscribing the same device updates the row
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null,
  auth text not null,
  -- set by the daily reminder so a cron retry the same day sends nothing twice
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);
