-- Recomp: core schema, ported from the r19 web app's data model
-- (reference/docs/03-data-model.md section 16, reference/schemas/).
-- Every user-owned row carries user_id with owner-only RLS. Text ids are kept
-- where the web app generates them (g..., h..., u_..., m..., n...) so a backup
-- import keeps its references.

-- ───────────────────────── Profile and settings ─────────────────────────
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text check (char_length(name) <= 30),
  sex text not null default 'unspecified' check (sex in ('female','male','unspecified')),
  age smallint check (age between 13 and 100),
  height_cm numeric(5,1) check (height_cm between 120 and 230),
  cuisine text check (char_length(cuisine) <= 40),
  water_l numeric(3,1) check (water_l between 1 and 6),
  kcal_floor int check (kcal_floor between 900 and 4000),         -- null = formula default
  protein_floor int check (protein_floor between 30 and 300),     -- null = formula default
  joint_friendly boolean not null default false,
  rules text check (char_length(rules) <= 1200),                  -- sensitive: injuries etc.
  equipment text not null default 'gym' check (equipment in ('gym','home','body')),
  training_days smallint not null default 3 check (training_days between 2 and 5),
  waist_weekday smallint not null default 1 check (waist_weekday between 0 and 6),
  setup_at timestamptz,
  keystone_habit_id text,
  bands jsonb not null default '[{"n":"Band 1","kg":null},{"n":"Band 2","kg":null},{"n":"Band 3","kg":null},{"n":"Band 4","kg":null},{"n":"Band 5","kg":null}]'::jsonb
    check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) = 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default ('n' || gen_random_uuid()),
  group_name text not null default 'My notes',
  title text not null default 'New note' check (char_length(title) <= 80),
  body text not null default '' check (char_length(body) <= 8000),
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Weigh-ins from before tracking started (profile.history in r19).
create table public.weight_history (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kg numeric(5,2) not null check (kg > 20 and kg < 400),
  note text check (char_length(note) <= 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Personal food table (profile.myFoods). Matched before the built-in table.
-- Every Claude estimate lands here so the same food is instant next time.
create table public.personal_foods (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  name text not null,
  keywords text[] not null default '{}',
  per text not null check (per in ('unit','100g')),
  grams numeric(7,1) not null check (grams > 0),
  kcal numeric(7,1) not null check (kcal >= 0),
  protein_g numeric(6,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6,1) not null default 0 check (fat_g >= 0),
  fiber_g numeric(6,1) not null default 0 check (fiber_g >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ───────────────────────── Goals and plans ─────────────────────────
create table public.goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default ('g' || gen_random_uuid()),
  name text not null check (char_length(name) <= 40),
  why text not null default '' check (char_length(why) <= 160),
  type text not null default 'lose' check (type in ('lose','recomp','muscle','health','gain','maintain')),
  start_date date not null,
  due_date date not null,
  event_date date,
  train_start_date date,
  start_kg numeric(5,2),
  target_kg numeric(5,2),
  end_kg numeric(5,2),
  kcal int not null check (kcal between 900 and 6000),
  protein_g int not null check (protein_g between 30 and 400),
  steps int not null default 8000 check (steps between 0 and 50000),
  home_first boolean not null default false,
  status text not null default 'active' check (status in ('active','done')),
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (due_date > start_date),
  check (event_date is null or (event_date >= due_date and event_date <= due_date + 30))
);
create unique index goals_one_active on public.goals (user_id) where status = 'active';

create table public.goal_milestones (
  user_id uuid not null default auth.uid(),
  id uuid primary key default gen_random_uuid(),
  goal_id text not null,
  date date not null,
  kind text not null check (kind in ('task','lab')),   -- lab = blood test: medical
  text text not null check (char_length(text) <= 120),
  updated_at timestamptz not null default now(),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);
create index on public.goal_milestones (user_id, date);

-- Versioned plans. body = the r19 Plan object {v, by, at, note, programs, phases, targets},
-- always passed through normPlan before writing. No current row = default protocol.
-- Restore previous = mark the prior version current (replaces planPrev).
create table public.plans (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  version int not null,
  source text not null check (source in ('default','claude','you')),
  note text check (char_length(note) <= 140),
  body jsonb not null check (jsonb_typeof(body) = 'object' and jsonb_array_length(body->'phases') = 4),
  goal_id text,
  kcal_at_save int,       -- goal targets when this version was replaced, so restore can put them back
  protein_at_save int,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);
create unique index plans_one_current on public.plans (user_id) where is_current;

-- Plan changes proposed by Claude (in-app or via the MCP connector). Never auto-applied:
-- the user taps Apply in the app, which writes a new plans version.
create table public.plan_proposals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('app','connector')),
  summary text not null check (char_length(summary) <= 400),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  kcal int,
  protein_g int,
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.plan_proposals (user_id, status);

-- "<programKey>|<original>" -> alternate, split into columns.
create table public.exercise_swaps (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_key text not null check (program_key ~ '^[A-Za-z0-9_-]{1,24}$'),
  original_name text not null,
  alternate_name text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, program_key, original_name)
);

-- ───────────────────────── Day logs ─────────────────────────
-- Day key = the device's local calendar date, stored as date (no time zone).
-- Child tables below are keyed by (user_id, date) without a hard FK, so rows can be
-- written in any order (offline sync); the food trigger creates the day row as needed.
create table public.day_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(5,2) check (weight_kg > 20 and weight_kg < 400),
  steps int check (steps between 0 and 200000),
  sleep_h numeric(4,2) check (sleep_h between 0 and 24),
  waist_cm numeric(5,1) check (waist_cm between 40 and 250),
  note text,
  kcal_total int,          -- cache of food rows; manual total only on days with no food rows
  protein_total_g int,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.food_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  date date not null,
  position int not null default 0,
  meal_no int,                          -- null = legacy ungrouped row
  label text not null,
  raw_text text,
  grams numeric(7,1),
  kcal numeric(7,1) not null default 0,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1) not null default 0,
  source text not null default 'none' check (source in ('table','claude','you','label','none')),
  cache_key text,                       -- "v2:" + canonName(raw)
  -- r19 needsNumbers rule. The connector's list_pending_foods reads this.
  needs_estimate boolean generated always as (source = 'none' or (source = 'claude' and kcal = 0 and protein_g = 0)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.food_entries (user_id, date, position);
create index food_entries_pending on public.food_entries (user_id) where needs_estimate;

-- Sets keyed by display name (after swap): r19's join key for history and progression.
create table public.set_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  date date not null,
  exercise_name text not null,
  program_key text,
  set_no int not null check (set_no >= 1),
  weight_kg numeric(6,2),
  band_slot smallint check (band_slot between 1 and 5),
  reps numeric(6,1),                    -- reps, or seconds for timed holds
  is_timed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, date, exercise_name, set_no),
  check (weight_kg is not null or band_slot is not null or reps is not null)
);
create index on public.set_entries (user_id, exercise_name, date);

-- ───────────────────────── Habits and checklist ─────────────────────────
create table public.habits (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default ('h' || gen_random_uuid()),
  name text not null check (char_length(name) between 1 and 40),
  type text not null default 'build' check (type in ('build','limit')),
  unit text not null check (char_length(unit) <= 8),
  goal numeric not null default 0 check (goal >= 0),
  step numeric not null default 1 check (step > 0),
  sort int not null default 0,
  archived_at timestamptz,              -- archive instead of delete so history keeps a name
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.habit_logs (
  user_id uuid not null default auth.uid(),
  habit_id text not null,
  date date not null,
  value numeric not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id, date),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);
create index on public.habit_logs (user_id, date);

create table public.habit_sessions (
  user_id uuid not null default auth.uid(),
  id uuid primary key default gen_random_uuid(),
  habit_id text not null,
  date date not null,                   -- credited day (the start day)
  started_at timestamptz not null,
  ended_at timestamptz not null,
  source text not null default 'timer' check (source in ('timer','pomodoro')),
  check (ended_at > started_at),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);
create index on public.habit_sessions (user_id, habit_id, date);

-- Medicines and supplements often live here: health data.
create table public.user_checks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) <= 60),
  when_label text not null default 'anytime' check (char_length(when_label) <= 12),
  subtitle text not null default '',
  overrides_builtin boolean generated always as (id in ('waist','photos','water','protein','lab','task','mobility','train','sleep')) stored,
  builtin_only boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.hidden_checks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  check_id text not null,
  label text not null,
  primary key (user_id, check_id)
);

create table public.check_ticks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  check_id text not null,
  done boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date, check_id)
);

-- ───────────────────────── Food extras ─────────────────────────
create table public.food_cache_user (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (key ~ '^v2:.+'),
  name text not null,
  serving_g numeric(7,1) not null default 100,
  kcal_100g numeric(7,1) not null,
  protein_100g numeric(6,1) not null default 0,
  carbs_100g numeric(6,1) not null default 0,
  fat_100g numeric(6,1) not null default 0,
  fiber_100g numeric(6,1) not null default 0,
  unit_only boolean not null default false,
  source text not null default 'claude' check (source in ('claude','you','label')),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Shared, no personal data. Readable by signed-in users; written only server-side
-- (service role, e.g. the connector Edge Function).
create table public.food_cache_global (
  key text primary key check (key ~ '^v2:.+'),
  name text not null,
  serving_g numeric(7,1) not null default 100,
  kcal_100g numeric(7,1) not null,
  protein_100g numeric(6,1) not null default 0,
  carbs_100g numeric(6,1) not null default 0,
  fat_100g numeric(6,1) not null default 0,
  fiber_100g numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);

-- rows = snapshot [{label, raw, kcal, p, c, f, fib, src}]. Max 12 enforced in the app.
create table public.saved_meals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default ('m' || gen_random_uuid()),
  name text not null check (char_length(name) <= 30),
  sig text not null default '',
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ───────────────────────── Reviews and reminders ─────────────────────────
-- out = the normReview result (r19 shape: grade, headline, truths, leak, commitments,
-- wins, watch, focus, suggestion). stats = weekStats snapshot. Both immutable.
create table public.reviews (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  end_date date not null,
  start_date date not null,
  stats jsonb not null,
  out jsonb not null,
  change_kcal int,
  change_steps int,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, end_date),
  check (change_kcal is null or change_steps is null)
);

create table public.reminders (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (key in ('train','dates','review') or key like 'chk:%'),
  enabled boolean not null,
  local_time time not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Only for offering a one-time cleanup of calendar events the web app created.
create table public.legacy_calendar_events (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  item_key text,
  event_id text,
  title text,
  tag text
);

-- ───────────────────────── RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','profile_notes','weight_history','personal_foods','goals','goal_milestones',
    'plans','plan_proposals','exercise_swaps','day_logs','food_entries','set_entries','habits','habit_logs',
    'habit_sessions','user_checks','hidden_checks','check_ticks','food_cache_user','saved_meals','reviews',
    'reminders','legacy_calendar_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.food_cache_global enable row level security;
create policy "read" on public.food_cache_global for select to authenticated using (true);

-- ───────────────────────── Triggers ─────────────────────────
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Profile row on sign-up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep day_logs.kcal_total / protein_total_g equal to the food rows (r19 syncFoodToDay).
-- When the last food row goes, both are cleared. Security definer only so it can see
-- auth.users: during account deletion the cascade removes food rows after the user row,
-- and recreating a day_logs row then would abort the delete.
create function public.sync_day_food_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; k numeric; p numeric; n int;
begin
  for r in
    select distinct user_id, date from (
      select new.user_id, new.date where tg_op <> 'DELETE'
      union all
      select old.user_id, old.date where tg_op <> 'INSERT'
    ) s
  loop
    continue when not exists (select 1 from auth.users u where u.id = r.user_id);
    select count(*), sum(kcal), sum(protein_g) into n, k, p
      from public.food_entries where user_id = r.user_id and date = r.date;
    if n > 0 then
      insert into public.day_logs (user_id, date, kcal_total, protein_total_g)
      values (r.user_id, r.date, round(k)::int, round(p)::int)
      on conflict (user_id, date) do update
        set kcal_total = excluded.kcal_total, protein_total_g = excluded.protein_total_g;
    else
      update public.day_logs set kcal_total = null, protein_total_g = null
        where user_id = r.user_id and date = r.date;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.sync_day_food_totals() from public, anon, authenticated;
create trigger food_totals after insert or update or delete on public.food_entries
  for each row execute function public.sync_day_food_totals();
