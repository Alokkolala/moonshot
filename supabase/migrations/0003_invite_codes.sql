-- Invite-code signup. Admins mint codes with a usage cap; registration is only
-- allowed through the worker's /register endpoint, which atomically redeems a
-- code before creating the auth user. Public Supabase signup should be DISABLED
-- in the dashboard (Auth → Providers → Email → "Allow new users to sign up" off)
-- so this is the only way in.

create table public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  max_uses   int  not null default 20 check (max_uses >= 1),
  uses       int  not null default 0  check (uses >= 0),
  active     boolean not null default true,
  note       text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- Which code a user signed up with (set by the worker at registration).
alter table public.profiles add column invite_code text;

-- Atomic redeem: lock the row, verify capacity, bump uses — all in one UPDATE.
-- Returns true only if a slot was actually claimed.
create or replace function public.redeem_invite_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  update public.invite_codes
     set uses = uses + 1
   where code = p_code and active and uses < max_uses
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

-- Give a slot back if user creation fails after a successful redeem.
create or replace function public.release_invite_code(p_code text)
returns void language sql security definer set search_path = public as $$
  update public.invite_codes set uses = greatest(uses - 1, 0) where code = p_code;
$$;

-- RLS: only admins manage codes (the worker uses the service role, which bypasses
-- RLS, to redeem during registration). Codes are never exposed to normal users.
alter table public.invite_codes enable row level security;
create policy invite_codes_admin_all on public.invite_codes for all
  using (public.is_admin()) with check (public.is_admin());

-- Live code-usage updates for the admin dashboard.
alter table public.invite_codes replica identity full;
alter publication supabase_realtime add table public.invite_codes;
