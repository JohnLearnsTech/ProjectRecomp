-- Me > Goal and Me > Plan, as in r19.
-- 1. "Back to the original" (r19 savePlan(null)): a plan version with no body means the default
--    protocol for the current goal, so it keeps following goal edits, and Restore previous still works.
alter table public.plans alter column body drop not null;
alter table public.plans drop constraint plans_body_check;
alter table public.plans add constraint plans_body_check
  check (body is null or (jsonb_typeof(body) = 'object' and jsonb_array_length(body->'phases') = 4));

create or replace function public.save_plan(p jsonb) returns int
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.goals%rowtype;
  prev_v int;
  v int;
  b jsonb := nullif(p->'body', 'null'::jsonb);
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into g from public.goals where user_id = uid and status = 'active';
  if not found then raise exception 'no active goal'; end if;
  select version into prev_v from public.plans where user_id = uid and is_current;
  update public.plans set is_current = false where user_id = uid and is_current;
  select coalesce(max(version), 0) + 1 into v from public.plans where user_id = uid;
  insert into public.plans (user_id, version, source, note, body, goal_id, is_current, prev_version, prev_kcal, prev_protein)
  values (uid, v, case when b is null then 'default' else p->>'source' end, left(coalesce(p->>'note', ''), 140), b, g.id, true, prev_v, g.kcal, g.protein_g);
  update public.goals set kcal = coalesce((p->>'kcal')::int, kcal), protein_g = coalesce((p->>'protein')::int, protein_g)
  where user_id = uid and id = g.id;
  return v;
end $$;

-- 2. r19 "Finish this goal, start the next": close the active goal at the latest weight and open a
--    twelve-week one from there, in one transaction so there is never a moment without a goal.
create function public.finish_goal(p jsonb) returns text
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.goals%rowtype;
  gid text := 'g' || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into g from public.goals where user_id = uid and status = 'active';
  if not found then raise exception 'no active goal'; end if;
  update public.goals set status = 'done', end_kg = coalesce((p->>'end_kg')::numeric, end_kg) where user_id = uid and id = g.id;
  insert into public.goals (user_id, id, name, why, type, start_date, due_date, train_start_date, start_kg, target_kg, kcal, protein_g, steps, home_first, status, sort)
  values (uid, gid, 'Next goal', '', g.type, (p->>'start')::date, (p->>'due')::date, (p->>'start')::date, (p->>'start_kg')::numeric, (p->>'target_kg')::numeric,
          g.kcal, g.protein_g, g.steps, false, 'active', coalesce((select max(sort) + 1 from public.goals where user_id = uid), 0));
  return gid;
end $$;

revoke execute on function public.finish_goal(jsonb) from public, anon;
grant execute on function public.finish_goal(jsonb) to authenticated;
