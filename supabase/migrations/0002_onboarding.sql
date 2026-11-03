-- Setup wizard (r19 finishOnboarding) as one transaction, so a dropped connection can
-- never leave the old goal closed without a new one. Runs as the caller: RLS still applies.

-- r19 accepts weights up to 350 kg; calcTargets can then return close to 10,000 kcal for a
-- "build muscle" goal. The old 6,000 cap would have made setup fail for those users.
alter table public.goals drop constraint goals_kcal_check;
alter table public.goals add constraint goals_kcal_check check (kcal between 800 and 12000);

create function public.finish_onboarding(p jsonb) returns text
language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  day date := (p->>'day')::date;
  w numeric := (p->>'weight_kg')::numeric;
  g jsonb := p->'goal';
  pr jsonb := p->'profile';
  gid text;
  old record;
  endkg numeric;
begin
  if uid is null then raise exception 'not signed in'; end if;

  -- 1. Close the active goal at its latest weigh-in (r19 latestWeight: last weight in the goal window).
  for old in select id, start_date, due_date from public.goals where user_id = uid and status = 'active' loop
    select dl.weight_kg into endkg from public.day_logs dl
      where dl.user_id = uid and dl.date between old.start_date and old.due_date and dl.weight_kg is not null
      order by dl.date desc limit 1;
    update public.goals set status = 'done', end_kg = endkg where user_id = uid and id = old.id;
  end loop;

  -- 2. The new goal. Training starts with the goal.
  insert into public.goals (user_id, name, type, start_date, due_date, train_start_date, start_kg, target_kg,
                            kcal, protein_g, steps, home_first, status, sort)
  values (uid, g->>'name', g->>'type', day, (g->>'due_date')::date, day, w, (g->>'target_kg')::numeric,
          (g->>'kcal')::int, (g->>'protein_g')::int, (g->>'steps')::int, coalesce((g->>'home_first')::boolean, false), 'active',
          coalesce((select max(sort) + 1 from public.goals where user_id = uid), 0))
  returning id into gid;

  -- 3. Profile. "Home now, gym later" is stored as gym equipment plus goals.home_first.
  update public.profiles set
    name = nullif(left(trim(pr->>'name'), 30), ''),
    sex = coalesce(nullif(pr->>'sex', ''), 'unspecified'),
    age = (pr->>'age')::smallint,
    height_cm = (pr->>'height_cm')::numeric,
    cuisine = nullif(left(trim(coalesce(pr->>'cuisine', '')), 40), ''),
    equipment = pr->>'equipment',
    training_days = (pr->>'training_days')::smallint,
    joint_friendly = coalesce((pr->>'joint_friendly')::boolean, false),
    setup_at = now()
  where user_id = uid;

  -- 4. Habits. A first run gets r19's seed, then up to three picks that aren't already there by name.
  if not exists (select 1 from public.habits where user_id = uid) then
    insert into public.habits (user_id, id, name, type, unit, goal, step, sort) values
      (uid, 'gaming', 'Gaming / media', 'limit', 'h', 2, 0.5, 0),
      (uid, 'walk', 'Walk', 'build', 'min', 10, 5, 1);
  end if;
  insert into public.habits (user_id, id, name, type, unit, goal, step, sort)
  select uid, 'h' || gen_random_uuid(), h->>'name', h->>'type', h->>'unit', (h->>'goal')::numeric, (h->>'step')::numeric,
         (select coalesce(max(sort), -1) from public.habits where user_id = uid) + t.ord
  from jsonb_array_elements(coalesce(p->'habits', '[]'::jsonb)) with ordinality as t(h, ord)
  where t.ord <= 3
    and not exists (select 1 from public.habits x where x.user_id = uid and x.archived_at is null and lower(x.name) = lower(h->>'name'));

  -- 5. Today's weight, unless one is already logged.
  insert into public.day_logs (user_id, date, weight_kg) values (uid, day, w)
  on conflict (user_id, date) do update set weight_kg = coalesce(public.day_logs.weight_kg, excluded.weight_kg);

  -- 6. Back to the default plan (rebuilt from the new goal and profile).
  update public.plans set is_current = false where user_id = uid and is_current;

  return gid;
end $$;

revoke execute on function public.finish_onboarding(jsonb) from public, anon;
grant execute on function public.finish_onboarding(jsonb) to authenticated;
