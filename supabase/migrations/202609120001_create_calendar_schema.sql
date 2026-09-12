-- 루틴캘린더: 익명 사용자별 고정 일과와 일회성 일정
-- 실행 전 Supabase Dashboard > Authentication > Providers에서 Anonymous sign-ins를 활성화하세요.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 30),
  description text not null default '' check (char_length(description) <= 70),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routines_time_order check (end_time > start_time)
);
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 30),
  event_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_order check (end_time > start_time)
);
create index if not exists routines_owner_weekday_idx on public.routines(owner_id, weekday);
create index if not exists calendar_events_owner_date_idx on public.calendar_events(owner_id, event_date);
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists routines_set_updated_at on public.routines;
create trigger routines_set_updated_at before update on public.routines for each row execute function public.set_updated_at();
drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id) values (new.id) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.create_profile_for_new_user();
alter table public.profiles enable row level security;
alter table public.routines enable row level security;
alter table public.calendar_events enable row level security;
create policy "profiles: own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "routines: own rows" on public.routines for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "calendar events: own rows" on public.calendar_events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
