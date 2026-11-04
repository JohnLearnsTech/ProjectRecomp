-- Restore an r19 backup (reference docs/03-data-model.md §17). The app converts the backup
-- (app/src/domain/backup.ts) and sends rows for every table; this replaces everything the
-- caller owns in one transaction, so a failed restore leaves the account as it was.
-- Runs as the caller: RLS still applies to every row.

-- PostgREST applies a function's statement_timeout, so a large backup gets more than the usual 8 s.
create function public.import_backup(p jsonb) returns jsonb
language plpgsql set search_path = '' set statement_timeout = '120s' as $$
declare
  uid uuid := auth.uid();
  t text;
  res jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;

  -- 1. Clear. Children go with their parents (milestones with goals, logs with habits).
  foreach t in array array['food_entries','set_entries','day_logs','check_ticks','habit_sessions','habit_logs','habits',
    'goal_milestones','goals','plans','plan_proposals','exercise_swaps','profile_notes','weight_history','personal_foods',
    'user_checks','hidden_checks','food_cache_user','saved_meals','reviews','reminders','legacy_calendar_events']
  loop
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;

  -- 2. Profile.
  update public.profiles pr set
    name = x.name, sex = x.sex, age = x.age, height_cm = x.height_cm, cuisine = x.cuisine, water_l = x.water_l,
    kcal_floor = x.kcal_floor, protein_floor = x.protein_floor, joint_friendly = x.joint_friendly, rules = x.rules,
    equipment = x.equipment, training_days = x.training_days, waist_weekday = x.waist_weekday, setup_at = x.setup_at,
    keystone_habit_id = x.keystone_habit_id, bands = x.bands
  from jsonb_populate_record(null::public.profiles, p->'profile') x
  where pr.user_id = uid;

  -- 3. Everything else. Day logs before food rows: the food trigger then fills the day totals.
  insert into public.profile_notes (user_id, id, group_name, title, body, sort)
    select uid, id, group_name, title, body, sort from jsonb_populate_recordset(null::public.profile_notes, coalesce(p->'profile_notes', '[]'));
  insert into public.weight_history (user_id, date, kg, note)
    select uid, date, kg, note from jsonb_populate_recordset(null::public.weight_history, coalesce(p->'weight_history', '[]'));
  insert into public.personal_foods (user_id, name, keywords, per, grams, kcal, protein_g, carbs_g, fat_g, fiber_g)
    select uid, name, keywords, per, grams, kcal, protein_g, carbs_g, fat_g, fiber_g from jsonb_populate_recordset(null::public.personal_foods, coalesce(p->'personal_foods', '[]'));
  insert into public.goals (user_id, id, name, why, type, start_date, due_date, event_date, train_start_date, start_kg, target_kg, end_kg,
                            kcal, protein_g, steps, home_first, status, sort)
    select uid, id, name, why, type, start_date, due_date, event_date, train_start_date, start_kg, target_kg, end_kg,
           kcal, protein_g, steps, home_first, status, sort from jsonb_populate_recordset(null::public.goals, coalesce(p->'goals', '[]'));
  insert into public.goal_milestones (user_id, goal_id, date, kind, text)
    select uid, goal_id, date, kind, text from jsonb_populate_recordset(null::public.goal_milestones, coalesce(p->'goal_milestones', '[]'));
  insert into public.plans (user_id, version, source, note, body, goal_id, is_current, prev_version, prev_kcal, prev_protein)
    select uid, version, source, note, body, goal_id, is_current, prev_version, prev_kcal, prev_protein from jsonb_populate_recordset(null::public.plans, coalesce(p->'plans', '[]'));
  insert into public.exercise_swaps (user_id, program_key, original_name, alternate_name)
    select uid, program_key, original_name, alternate_name from jsonb_populate_recordset(null::public.exercise_swaps, coalesce(p->'exercise_swaps', '[]'));
  insert into public.day_logs (user_id, date, weight_kg, steps, sleep_h, waist_cm, note, kcal_total, protein_total_g)
    select uid, date, weight_kg, steps, sleep_h, waist_cm, note, kcal_total, protein_total_g from jsonb_populate_recordset(null::public.day_logs, coalesce(p->'day_logs', '[]'));
  insert into public.food_entries (user_id, date, position, meal_no, label, raw_text, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, source, cache_key)
    select uid, date, position, meal_no, label, raw_text, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, source, cache_key
    from jsonb_populate_recordset(null::public.food_entries, coalesce(p->'food_entries', '[]'));
  insert into public.set_entries (user_id, date, exercise_name, program_key, set_no, weight_kg, band_slot, reps, is_timed)
    select uid, date, exercise_name, program_key, set_no, weight_kg, band_slot, reps, is_timed from jsonb_populate_recordset(null::public.set_entries, coalesce(p->'set_entries', '[]'));
  insert into public.habits (user_id, id, name, type, unit, goal, step, sort, archived_at)
    select uid, id, name, type, unit, goal, step, sort, archived_at from jsonb_populate_recordset(null::public.habits, coalesce(p->'habits', '[]'));
  insert into public.habit_logs (user_id, habit_id, date, value)
    select uid, habit_id, date, value from jsonb_populate_recordset(null::public.habit_logs, coalesce(p->'habit_logs', '[]'));
  insert into public.habit_sessions (user_id, habit_id, date, started_at, ended_at, source)
    select uid, habit_id, date, started_at, ended_at, source from jsonb_populate_recordset(null::public.habit_sessions, coalesce(p->'habit_sessions', '[]'));
  insert into public.user_checks (user_id, id, title, when_label, subtitle, builtin_only, sort)
    select uid, id, title, when_label, subtitle, builtin_only, sort from jsonb_populate_recordset(null::public.user_checks, coalesce(p->'user_checks', '[]'));
  insert into public.hidden_checks (user_id, check_id, label)
    select uid, check_id, label from jsonb_populate_recordset(null::public.hidden_checks, coalesce(p->'hidden_checks', '[]'));
  insert into public.check_ticks (user_id, date, check_id, done)
    select uid, date, check_id, done from jsonb_populate_recordset(null::public.check_ticks, coalesce(p->'check_ticks', '[]'));
  insert into public.food_cache_user (user_id, key, name, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, unit_only, source)
    select uid, key, name, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, unit_only, source
    from jsonb_populate_recordset(null::public.food_cache_user, coalesce(p->'food_cache_user', '[]'));
  insert into public.saved_meals (user_id, id, name, sig, rows, sort)
    select uid, id, name, sig, rows, sort from jsonb_populate_recordset(null::public.saved_meals, coalesce(p->'saved_meals', '[]'));
  insert into public.reviews (user_id, end_date, start_date, stats, out, change_kcal, change_steps, applied_at, created_at)
    select uid, end_date, start_date, stats, out, change_kcal, change_steps, applied_at, created_at from jsonb_populate_recordset(null::public.reviews, coalesce(p->'reviews', '[]'));
  insert into public.reminders (user_id, key, enabled, local_time)
    select uid, key, enabled, local_time from jsonb_populate_recordset(null::public.reminders, coalesce(p->'reminders', '[]'));
  insert into public.legacy_calendar_events (user_id, item_key, event_id, title, tag)
    select uid, item_key, event_id, title, tag from jsonb_populate_recordset(null::public.legacy_calendar_events, coalesce(p->'legacy_calendar_events', '[]'));

  -- 4. What landed, for the app to compare with what it sent (§17.5).
  select jsonb_build_object(
    'days', (select count(*) from public.day_logs where user_id = uid),
    'kcalSum', (select coalesce(sum(kcal_total), 0) from public.day_logs where user_id = uid),
    'foodRows', (select count(*) from public.food_entries where user_id = uid),
    'sets', (select count(*) from public.set_entries where user_id = uid),
    'setsByExercise', coalesce((select jsonb_object_agg(exercise_name, n) from (select exercise_name, count(*) n from public.set_entries where user_id = uid group by 1) s), '{}'),
    'habitValues', coalesce((select jsonb_object_agg(habit_id, n) from (select habit_id, count(*) n from public.habit_logs where user_id = uid group by 1) s), '{}'),
    'goals', (select count(*) from public.goals where user_id = uid),
    'reviews', (select count(*) from public.reviews where user_id = uid),
    'latestWeight', (select jsonb_build_object('date', date, 'kg', weight_kg) from public.day_logs where user_id = uid and weight_kg is not null order by date desc limit 1)
  ) into res;
  return res;
end $$;

revoke execute on function public.import_backup(jsonb) from public, anon;
grant execute on function public.import_backup(jsonb) to authenticated;
