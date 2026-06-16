-- Moonshot cloud schema — decks, slides, turns, events + RLS + Realtime + Storage.
--
-- Trust model:
--   * The browser uses the Supabase ANON key and is constrained entirely by the
--     RLS policies below: a user can only ever see/touch rows where user_id = their
--     auth.uid(). It manages decks + outline editing directly.
--   * The Codex worker uses the SERVICE-ROLE key, which BYPASSES RLS. It is the
--     only writer of turns / turn_events / slides (the generation outputs). The
--     browser only ever READS those — Realtime + RLS routes each user their own
--     stream, replacing the Tauri `codex://*` event channel.

-- ============================== extensions ==============================
create extension if not exists pgcrypto;        -- gen_random_uuid()

-- ================================ enums ================================
create type deck_mode   as enum ('moonshot', 'edu');
create type deck_phase  as enum ('brief', 'outline', 'slides');
create type slide_status as enum ('idle', 'generating', 'done', 'error');
create type turn_kind   as enum ('outline', 'slide');
create type turn_status as enum ('queued', 'running', 'done', 'error');

-- ================================ decks ================================
-- One project: brand brief -> outline -> rendered slides. Mirrors the Deck type,
-- but disk paths are gone: attachments + slides live in Storage.
create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  mode        deck_mode  not null default 'moonshot',
  title       text       not null default 'Untitled deck',
  brief       text       not null default '',
  slide_count int        not null default 8 check (slide_count between 1 and 40),
  brand       jsonb,                                   -- inferred Brand
  outline     jsonb      not null default '[]'::jsonb, -- OutlineSlide[]
  attachments jsonb      not null default '[]'::jsonb, -- {id,name,storage_path,kind}[]
  thread_id   text,                                    -- Codex thread, reused per slide
  phase       deck_phase not null default 'brief',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index decks_user_idx on public.decks (user_id, updated_at desc);

-- ================================ slides ===============================
-- One rendered slide per outline entry (was the slides{} map keyed by OutlineSlide.id).
-- user_id is denormalised so RLS + Realtime need no join.
create table public.slides (
  deck_id      uuid not null references public.decks (id) on delete cascade,
  outline_id   text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       slide_status not null default 'idle',
  storage_path text,                                   -- slides bucket key
  error        text,
  updated_at   timestamptz not null default now(),
  primary key (deck_id, outline_id)
);
create index slides_user_idx on public.slides (user_id);

-- ================================ turns ================================
-- One Codex turn = the unit of work the worker runs. Doubles as the TurnRecord
-- the Insights view aggregates (usage + duration).
create table public.turns (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.decks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        turn_kind   not null,
  label       text        not null default '',
  status      turn_status not null default 'queued',
  thread_id   text,                                    -- captured from thread.started
  usage       jsonb,                                   -- TurnUsage from turn.completed
  duration_ms int,
  ok          boolean,
  error       text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index turns_quota_idx  on public.turns (user_id, created_at desc); -- per-user daily quota
create index turns_deck_idx   on public.turns (deck_id, created_at);
create index turns_status_idx on public.turns (status);                   -- worker queue scan

-- ============================= turn_events =============================
-- The realtime stream: every JSONL event / image / error / done the worker
-- produces for a turn, in order. Browser subscribes filtered to its own rows.
create table public.turn_events (
  id      bigint generated always as identity primary key,
  turn_id uuid not null references public.turns (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seq     int  not null,                               -- per-turn ordering
  channel text not null,                               -- event|image|error|done|info
  payload jsonb not null default '{}'::jsonb,
  ts      timestamptz not null default now()
);
create index turn_events_stream_idx on public.turn_events (turn_id, seq);

-- ============================ updated_at trigger =======================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger decks_touch  before update on public.decks
  for each row execute function public.touch_updated_at();
create trigger slides_touch before update on public.slides
  for each row execute function public.touch_updated_at();

-- ================================= RLS =================================
alter table public.decks       enable row level security;
alter table public.slides      enable row level security;
alter table public.turns       enable row level security;
alter table public.turn_events enable row level security;

-- decks: owner has full control (browser manages briefs + outline editing).
create policy decks_select on public.decks for select using (user_id = auth.uid());
create policy decks_insert on public.decks for insert with check (user_id = auth.uid());
create policy decks_update on public.decks for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy decks_delete on public.decks for delete using (user_id = auth.uid());

-- Generation outputs: owner READ-only. Inserts/updates come from the worker
-- (service role bypasses RLS), so no write policies are granted to users.
create policy slides_select      on public.slides      for select using (user_id = auth.uid());
create policy turns_select       on public.turns       for select using (user_id = auth.uid());
create policy turn_events_select on public.turn_events for select using (user_id = auth.uid());

-- =============================== Realtime ==============================
-- Updates/deletes must carry the old row so RLS can be evaluated on the change.
alter table public.turns  replica identity full;
alter table public.slides replica identity full;

alter publication supabase_realtime add table public.turn_events;
alter publication supabase_realtime add table public.turns;
alter publication supabase_realtime add table public.slides;

-- =============================== Storage ===============================
-- Private buckets. Convention: object key is `{user_id}/{deck_id}/...` so the
-- first path segment scopes ownership.
insert into storage.buckets (id, name, public) values ('slides', 'slides', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

-- Slides: worker writes (service role); user reads own (or via signed URLs).
create policy "slides read own" on storage.objects for select to authenticated
  using (bucket_id = 'slides' and (storage.foldername(name))[1] = auth.uid()::text);

-- Attachments: user uploads + reads own.
create policy "attachments rw own" on storage.objects for all to authenticated
  using      (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
