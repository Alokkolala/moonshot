-- Quota + admin layer.
--
-- Rules:
--   * Every user starts with deck_allowance = 1 and decks are capped at 8 slides.
--   * To generate more decks, a user files a deck_request; an admin approves it,
--     which bumps their allowance (handled by a trigger so it can't be forged).
--   * Admins can READ every user's profile, requests, decks, turns and events.
--
-- Enforcement split:
--   * Slide cap (<= 8)         -> DB check constraint (hard backstop).
--   * Deck allowance           -> the worker checks generated-deck count vs
--                                 profiles.deck_allowance before starting a deck.
--                                 (RLS can't count cross-row, so the worker is the
--                                 gate; service role bypasses RLS to read profiles.)

-- ================================ enums ================================
create type user_role      as enum ('user', 'admin');
create type request_status as enum ('pending', 'approved', 'denied');

-- =============================== profiles ==============================
-- One row per auth user. role + deck_allowance are admin-controlled (users have
-- no update policy on this table, so they can't escalate themselves).
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  role           user_role not null default 'user',
  deck_allowance int       not null default 1 check (deck_allowance >= 0),
  created_at     timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================ deck_requests ============================
-- A user's request for more deck capacity, awaiting an admin decision.
create table public.deck_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  requested_decks int  not null default 1 check (requested_decks between 1 and 20),
  reason         text,
  status         request_status not null default 'pending',
  decided_by     uuid references auth.users (id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index deck_requests_user_idx   on public.deck_requests (user_id, created_at desc);
create index deck_requests_status_idx on public.deck_requests (status);

-- Approving a request bumps the user's allowance; deciding stamps who/when.
-- SECURITY DEFINER so the allowance update isn't blocked by the user's own RLS.
create or replace function public.apply_deck_grant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.profiles
       set deck_allowance = deck_allowance + new.requested_decks
     where id = new.user_id;
  end if;
  if new.status <> old.status then
    new.decided_at = now();
    new.decided_by = auth.uid();
  end if;
  return new;
end;
$$;
create trigger deck_requests_apply
  before update on public.deck_requests
  for each row execute function public.apply_deck_grant();

-- ============================== is_admin() =============================
-- SECURITY DEFINER + own search_path so it reads profiles without tripping that
-- table's RLS (avoids policy recursion).
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ================================ RLS ==================================
alter table public.profiles      enable row level security;
alter table public.deck_requests enable row level security;

-- profiles: user reads own; admin reads + writes all. Users have NO write policy.
create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_admin_all  on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- deck_requests: user files + reads own (always as 'pending'); admin reads + decides.
create policy dr_select_own  on public.deck_requests for select
  using (user_id = auth.uid() or public.is_admin());
create policy dr_insert_own  on public.deck_requests for insert
  with check (user_id = auth.uid() and status = 'pending');
create policy dr_admin_update on public.deck_requests for update
  using (public.is_admin()) with check (public.is_admin());

-- ===================== admin read-through on app data ==================
-- Permissive policies are OR'd with the existing owner-only ones from 0001, so
-- these simply add "...or the caller is an admin" to every read.
create policy decks_admin_select       on public.decks       for select using (public.is_admin());
create policy slides_admin_select      on public.slides      for select using (public.is_admin());
create policy turns_admin_select       on public.turns       for select using (public.is_admin());
create policy turn_events_admin_select on public.turn_events for select using (public.is_admin());

-- ============================ slide cap -> 8 ===========================
alter table public.decks drop constraint decks_slide_count_check;
alter table public.decks add  constraint decks_slide_count_check
  check (slide_count between 1 and 8);

-- Realtime for the admin dashboard: stream new/decided requests live.
alter table public.deck_requests replica identity full;
alter publication supabase_realtime add table public.deck_requests;

-- ----------------------------------------------------------------------
-- Seed the first admin manually after they sign up, e.g.:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
