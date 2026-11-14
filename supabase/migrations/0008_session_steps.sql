-- Steps for each walk session, counted by the phone's walk tracker. Null for other habits and
-- for sessions logged before this existed.
alter table public.habit_sessions add column if not exists steps int check (steps is null or steps >= 0);
