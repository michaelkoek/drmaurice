-- DrMauriceCards schema. Every row belongs to one student (user_id) and is only
-- visible to that student through row-level security.

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  exam_date date,
  question_count integer check (question_count is null or question_count > 0),
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  hint text,
  color smallint not null default 0 check (color between 0 and 5),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  -- restrict: a subject with lessons cannot be deleted until its lessons are moved
  subject_id uuid references public.subjects(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  goals jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  findings jsonb not null default '{"gaps":[],"conflicts":[]}'::jsonb,
  source jsonb,
  created_at timestamptz not null default now()
);

create table public.own_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  goal integer not null default 0,
  question text not null check (char_length(question) between 1 and 1000),
  answer_html text not null,
  answer_raw text not null check (char_length(answer_raw) between 1 and 5000),
  source text not null default 'Eigen kaart',
  -- id of the generated card this one replaces (e.g. an answer that was missing)
  replaces text,
  created_at timestamptz not null default now()
);

create table public.progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  mastered text[] not null default '{}',
  first_try jsonb not null default '{}'::jsonb,
  last_studied_at timestamptz,
  primary key (user_id, lesson_id)
);

create index on public.subjects (exam_id);
create index on public.lessons (exam_id);
create index on public.own_cards (lesson_id);

alter table public.exams enable row level security;
alter table public.subjects enable row level security;
alter table public.lessons enable row level security;
alter table public.own_cards enable row level security;
alter table public.progress enable row level security;

create policy "own rows" on public.exams for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.subjects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.lessons for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.own_cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
