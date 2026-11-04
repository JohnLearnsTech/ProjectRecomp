-- Plan changes from Claude, a weekly review or the user, with r19's one-step undo
-- (savePlan / restorePrevPlan). Each version remembers what it replaced: the previous
-- version (null = the default protocol) and the goal's calorie and protein targets then.

alter table public.plans
  add column prev_version int,
  add column prev_kcal int,
  add column prev_protein int;

-- p: {body, source, note, kcal?, protein?}. Sets the new targets on the active goal in the
-- same transaction. body is checked by normPlan in the app before it gets here.
create function public.save_plan(p jsonb) returns int
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.goals%rowtype;
  prev_v int;
  v int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into g from public.goals where user_id = uid and status = 'active';
  if not found then raise exception 'no active goal'; end if;
  select version into prev_v from public.plans where user_id = uid and is_current;
  update public.plans set is_current = false where user_id = uid and is_current;
  select coalesce(max(version), 0) + 1 into v from public.plans where user_id = uid;
  insert into public.plans (user_id, version, source, note, body, goal_id, is_current, prev_version, prev_kcal, prev_protein)
  values (uid, v, p->>'source', left(coalesce(p->>'note', ''), 140), p->'body', g.id, true, prev_v, g.kcal, g.protein_g);
  update public.goals set kcal = coalesce((p->>'kcal')::int, kcal), protein_g = coalesce((p->>'protein')::int, protein_g)
  where user_id = uid and id = g.id;
  return v;
end $$;

-- One tap back: the replaced plan (or the default protocol) and the targets of the time.
-- Restoring a saved plan is itself a change, so it can be undone again, as in r19.
create function public.restore_previous_plan() returns int
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.plans%rowtype;
  old public.plans%rowtype;
  g public.goals%rowtype;
  v int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into c from public.plans where user_id = uid and is_current;
  if not found then raise exception 'nothing to restore'; end if;
  select * into g from public.goals where user_id = uid and status = 'active';
  update public.plans set is_current = false where id = c.id;
  if c.prev_version is not null then
    select * into old from public.plans where user_id = uid and version = c.prev_version;
    select coalesce(max(version), 0) + 1 into v from public.plans where user_id = uid;
    insert into public.plans (user_id, version, source, note, body, goal_id, is_current, prev_version, prev_kcal, prev_protein)
    values (uid, v, old.source, old.note, old.body, old.goal_id, true, c.version, g.kcal, g.protein_g);
  end if;
  update public.goals set kcal = coalesce(c.prev_kcal, kcal), protein_g = coalesce(c.prev_protein, protein_g)
  where user_id = uid and status = 'active';
  return v;
end $$;

revoke execute on function public.save_plan(jsonb), public.restore_previous_plan() from public, anon;
grant execute on function public.save_plan(jsonb), public.restore_previous_plan() to authenticated;
