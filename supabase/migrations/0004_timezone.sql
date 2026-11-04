-- The phone's IANA time zone, so the connector (running in UTC) knows which calendar day is
-- "today" for this person. The app keeps it current on each launch.
alter table public.profiles add column timezone text check (timezone is null or char_length(timezone) <= 64);
