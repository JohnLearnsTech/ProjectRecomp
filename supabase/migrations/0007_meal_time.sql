-- When a meal was eaten. Set at logging time on the day itself; null for rows logged on a later
-- day (a backfill), since the logging time would be wrong. Editable per meal.
alter table public.food_entries add column eaten_at timestamptz;

-- Existing rows: their logging time, where they were logged on the day they are for.
update public.food_entries f set eaten_at = f.created_at
  from public.profiles p
  where p.user_id = f.user_id
    and (f.created_at at time zone coalesce(p.timezone, 'Asia/Kolkata'))::date = f.date;

-- A meal's rows share one time: the earliest logged row of the meal.
update public.food_entries f set eaten_at = m.t
  from (select user_id, date, meal_no, min(eaten_at) t from public.food_entries where meal_no is not null group by 1, 2, 3) m
  where f.user_id = m.user_id and f.date = m.date and f.meal_no = m.meal_no and m.t is not null;
