-- DrMauriceCards schema for Neon Postgres.
-- Auth tables follow Better Auth's core schema (better-auth 1.7).
-- Every app row belongs to one student (user_id). There is no row-level security:
-- the browser never talks to the database, and app/api/data/route.ts scopes every
-- query to the signed-in user.

-- ── Better Auth ───────────────────────────────────────────────────────────────
create table "user" (
  "id" text primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "session" (
  "id" text primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"("id") on delete cascade
);

create table "account" (
  "id" text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "verification" (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index on "session" ("userId");
create index on "account" ("userId");
create index on "verification" ("identifier");

-- ── App ───────────────────────────────────────────────────────────────────────
create table exams (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  exam_date date,
  question_count integer check (question_count is null or question_count > 0),
  created_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  hint text,
  color smallint not null default 0 check (color between 0 and 5),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  -- restrict: a subject with lessons cannot be deleted until its lessons are moved
  subject_id uuid references subjects(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  goals jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  findings jsonb not null default '{"gaps":[],"conflicts":[]}'::jsonb,
  source jsonb,
  created_at timestamptz not null default now()
);

create table own_cards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  goal integer not null default 0,
  question text not null check (char_length(question) between 1 and 1000),
  answer_html text not null,
  answer_raw text not null check (char_length(answer_raw) between 1 and 5000),
  source text not null default 'Eigen kaart',
  -- id of the generated card this one replaces (e.g. an answer that was missing)
  replaces text,
  created_at timestamptz not null default now()
);

create table progress (
  user_id text not null references "user"(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  mastered text[] not null default '{}',
  first_try jsonb not null default '{}'::jsonb,
  last_studied_at timestamptz,
  primary key (user_id, lesson_id)
);

create index on exams (user_id);
create index on subjects (exam_id);
create index on lessons (exam_id);
create index on own_cards (lesson_id);
