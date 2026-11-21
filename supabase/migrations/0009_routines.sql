-- Routines: skincare, haircare, dental care, medicines and anything else done on a schedule,
-- each with optional steps, reminder times and a frequency. Habits stay in their own tables.
create table public.routines (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null default 'other' check (kind in ('medicine','supplement','skin','hair','dental','other')),
  name text not null check (char_length(name) between 1 and 60),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 20),
  -- Reminder times as HH:MM, one per dose or session in a day; empty means "any time".
  times text[] not null default '{}' check (cardinality(times) <= 8),
  -- daily | days (on the weekdays in days, 0 = Sunday) | every (every n days from start_date) | asneeded
  freq text not null default 'daily' check (freq in ('daily','days','every','asneeded')),
  days int[] not null default '{}',
  every_n int check (every_n is null or every_n between 2 and 60),
  start_date date not null default current_date,
  end_date date,
  dose text check (char_length(dose) <= 60),
  note text check (char_length(note) <= 200),
  remind boolean not null default true,
  sort int not null default 0,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- One row per routine, day and slot (the index of the time in times; 0 when there are none).
create table public.routine_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null,
  date date not null,
  slot int not null default 0 check (slot between 0 and 7),
  done boolean not null default false,
  steps int[] not null default '{}',
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, routine_id, date, slot),
  foreign key (user_id, routine_id) references public.routines(user_id, id) on delete cascade
);

alter table public.routines enable row level security;
alter table public.routine_logs enable row level security;
create policy "owner" on public.routines for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.routine_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger touch before update on public.routines for each row execute function public.touch_updated_at();
create trigger touch before update on public.routine_logs for each row execute function public.touch_updated_at();
create index routine_logs_date on public.routine_logs (user_id, date);
