# Moonshot

Multi-tenant **web app** that turns a **brand brief into a full AI-generated slide deck**.
A user writes a topic, attaches brand assets (logo / refs / docs) and picks a slide count;
Codex infers the brand, drafts an editable outline, then renders each slide as a PNG.
All users share the **owner's single Codex CLI subscription** (ChatGPT-subscription auth,
no API key) — like opening many parallel Codex terminals. Everything (brand analysis,
planning, rendering) is **driven purely by prompts**, not Codex tools/functions.

## Cloud architecture

- **Frontend** → Vercel SPA (`https://moonshot-ashen.vercel.app`). Talks to Supabase
  (auth/db/realtime/storage) and the worker over HTTP.
- **Supabase** → Postgres + Auth + Realtime + Storage. RLS boxes each user to their own
  rows. Buckets: `attachments` (user uploads), `slides` (private PNGs, served as signed
  URLs). Public signup is **disabled**; users register with an **invite code**.
- **Worker** → Railway service (`https://moonshot-worker-production.up.railway.app`).
  Long-lived Express/TS process that spawns a concurrency-limited **pool + queue** of
  `codex exec --json` runs, each in an isolated per-session `CODEX_HOME` seeded with the
  shared auth, and streams events into Supabase. Service-role key (bypasses RLS) — it is
  the sole writer of `turns` / `turn_events` / `slides`. Holds the shared subscription.

**Trust split:** the browser uses the Supabase **anon** key (RLS-scoped to its own rows);
the worker uses the **service-role** key. Slides never expose disk paths — the browser
mints 1-hour signed URLs from the private `slides` bucket.

**Quota / admin:** each user gets **1 deck (≤8 slides)**; more needs admin approval
(`deck_requests`). Owner mints invite codes with a max-uses cap. Admins (role=`admin`)
see the admin console (users, requests, codes).

## Stack

- **React 18** + **Vite 6** + **TypeScript** (SPA on Vercel)
- **Supabase** (`@supabase/supabase-js`) for auth/db/realtime/storage
- **Worker:** Node + Express + `tsx` on Railway, spawns the **Codex CLI** (`@openai/codex`)
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **shadcn/ui** (new-york) + Radix primitives
- **motion** (`motion/react`) for animation, **lucide-react** for icons, **jspdf** for PDF export
- **Moonshot** = dark near-black OLED theme; **Moonshot Edu** = light "paper + indigo
  accent" theme (`.theme-edu` class on root).
- (Tauri 2 desktop shell was removed in the cloud migration; `src-tauri/` is legacy.)

## Modes (Moonshot ↔ Moonshot Edu)

Two products share one flow. `Mode = "moonshot" | "edu"` (in `types.ts`); each `Deck`
carries its own `mode`. The sidebar brand-mark is the toggle (animated title/icon swap
Moonshot ↔ Moonshot.edu via `AnimatePresence`); switching applies the `.theme-edu` light
theme to the root with a CSS cross-fade and filters the deck list to that mode. `App.switchMode`
jumps to (or creates) a deck of the target mode. Edu decks default to ~11 slides
(`EDU_DEFAULT_SLIDES`) and use the **edu directives** (`eduOutlineDirective` /
`eduSlideDirective` in Settings); directive choice is by `deck.mode`. Edu prompts are
curriculum-aware (objectives first, one idea/slide, analogy for every abstract idea,
worked examples, check-your-understanding, recap). When **source material is attached**
the planner preserves the source's full scope (re-teaches it more clearly, one idea per
*slide*) instead of collapsing to a single sub-topic; with no source it goes deep on one
sub-topic. Each outline slide also carries a `visual` (the distinct diagram for that
slide) so the deck varies its illustrations instead of repeating one motif — the edu slide
directive treats "consistency" as a shared design system, not a reused picture. BriefForm
and SettingsView (mode tabs) adapt copy per mode.

## Workflow (Studio)

A **Deck** moves through three phases: `brief → outline → slides`.

1. **Brief** (`BriefForm`): topic textarea + "Add assets" (hidden file input → each file
   uploaded to the `attachments` bucket at `{userId}/{deckId}/{uuid}-{name}`, stored as
   `{id,name,path:storagePath,kind}`) + slide-count stepper. "Create outline" starts the
   outline turn.
2. Outline turn: the browser POSTs `/decks/:deckId/turn` (`kind:"outline"`) with the
   prompt + `outlineDirective`; the worker enqueues a Codex run and streams events into
   `turn_events`. The browser subscribes via Realtime, reads the agent_message text, and
   `extractJson` parses the **planner JSON** (`{ brand, slides:[{title,brief,notes}] }`).
   `brand` + outline cards + `thread_id` are written back to the `decks` row.
3. **Outline** (`OutlineEditor`): editable per-slide cards (title/brief/notes, reorder,
   add, delete) + brand summary. "Generate slides" → `slides` phase + render all.
4. **Slides** (`SlideDeck`): sequential, one PNG per slide, **resuming the same thread**
   so Codex keeps the deck visually consistent. The worker uploads each PNG to the private
   `slides` bucket + inserts a `slides` row; the browser hydrates it via Realtime and mints
   a signed URL. Per-slide regenerate, save (fetch dataUrl → download), lightbox. **Export
   PDF** builds a one-slide-per-page PDF in the UI via `jspdf` (page sized to each PNG).

**Streaming (cloud):** `runCloudTurn` (in `lib/codex.ts`) calls `startTurn`, then
subscribes a Realtime channel on `turn_events` filtered `turn_id=eq.<id>` (with a catch-up
fetch on subscribe, deduped by `seq`). It parses `CodexEvent`s: `thread.started`→threadId,
`item.completed` agent_message→text, image events→imagePaths, plus terminal done/error.
The worker (service-role) is the only writer; the browser is read-only on turns/events.

Every turn is recorded as a `turns` row (token usage + duration); the deck-level Realtime
subscription hydrates them. **Insights** (sidebar nav) aggregates: total/in/out tokens,
cache-reuse %, total & avg-per-slide time, image count, failures, per-turn timeline.

Other views (sidebar nav): **Admin** (admins only — invite codes, deck requests, users),
**Dev console** (prompts + raw Codex events), **Settings** (editable directives, default
slide count, aspect ratio — persisted to `localStorage`).

## Structure

```
src/                          Frontend SPA (Vercel)
  main.tsx                React root → Root.tsx
  Root.tsx                AuthProvider + Gate (loading / AuthGate / App)
  App.tsx                 Sidebar + view switch; runOutline / renderSlide via runCloudTurn
  store.ts                useDecks hook — Supabase-backed Deck[] + Realtime; uid()/newDeck()
  settings.ts             useSettings hook — editable directives, localStorage
  types.ts                Deck, OutlineSlide, GeneratedSlide, Attachment, Brand, Settings, TurnRecord, CodexEvent, View…
  auth/
    AuthContext.tsx       AuthProvider + useAuth() — session/user/profile/isAdmin/signIn/signOut
    AuthGate.tsx          Full-screen signin / register-with-code UI
  lib/
    supabase.ts           Browser Supabase client (anon key, from VITE_SUPABASE_*)
    api.ts                Worker + edge-fn client: startTurn/stopTurn/fetchUsage, registerWithCode, uploadAttachment, signed URLs
    codex.ts              runCloudTurn (POST turn + Realtime stream) + extractJson
    mappers.ts            row↔Deck/Turn/Slide mappers (rowToSlide mints signed URL)
    prompts.ts            DEFAULT_*_DIRECTIVE + buildOutlinePrompt / buildSlidePrompt
    utils.ts              cn() helper
  components/
    Sidebar.tsx           View nav (Studio/Insights/Admin*/Dev/Settings), deck list, usage, signOut
    UsageMeter.tsx        Subscription usage (5h + weekly % left), polls worker /usage
    AdminView.tsx         Admin console: mint/toggle invite codes, approve/deny deck requests, role toggle
    DevConsole.tsx        Prompt + raw-event log
    InsightsView.tsx      Per-deck Codex stats: token/cache/time cards + turn timeline
    SettingsView.tsx      Edit directives + defaults
    studio/
      BriefForm.tsx       Brief input, asset upload (→ attachments bucket), slide-count, create-outline
      OutlineEditor.tsx   Brand summary + editable/reorderable slide cards
      SlideDeck.tsx       Slide grid, render-all/regenerate, save (download), lightbox, export-PDF
    ui/                   shadcn components

worker/                       Codex worker (Railway, Docker)
  src/index.ts            Express app: /register, JWT auth, /decks/:id/turn, /turns/:id/stop, /usage, /health; bootstrapCodexAuth()
  src/bootstrap.ts        Materialise shared Codex auth.json/config.toml from *_B64 env at boot
  src/config.ts           Env config (SUPABASE_*, CODEX_AUTH_HOME, MAX_CONCURRENT, timeouts, maxSlides=8)
  src/pool.ts             Concurrency-limited queue; downloads attachments per run; runs turns
  src/codex.ts            runCodexTurn — spawn `codex exec --json -s read-only` in temp CODEX_HOME, stream events, watch images
  src/supabase.ts         Service-role client: auth, turns/events/slides writes, invite-code redeem, attachment download
  src/usage.ts            Scrape rate_limits from session rollouts → CodexUsage
  Dockerfile              node:24-slim + git + global @openai/codex; CMD npm run start
  railway.json            DOCKERFILE builder + /health healthcheck

supabase/
  migrations/             0001_init, 0002_quota_and_admin, 0003_invite_codes
  functions/register/     Edge function — invite-code signup (also handled by worker /register)
index.css                 Tailwind v4 theme tokens
```

The two directives are owned by the **UI/Settings** and passed to the worker as the
`directive` field of the turn request (sent on stdin ahead of the prompt).

## Codex / worker notes

- The worker runs each turn in a throwaway `CODEX_HOME` (mkdtemp) seeded by copying the
  shared `auth.json` (+ `config.toml`) so every parallel session is logged in.
- **Auth bootstrap:** the owner runs `codex login` locally, then provides
  `CODEX_AUTH_JSON_B64` (base64 of `~/.codex/auth.json`) as a Railway env var;
  `bootstrap.ts` writes it into `CODEX_AUTH_HOME` at boot. (The owner sets this — do not
  handle their auth.json.) Optional `CODEX_CONFIG_TOML_B64` for `config.toml`.
- Runs are `-s read-only`, `--skip-git-repo-check`; attachments are dropped into the
  session `assets/<name>` and the prompt references `assets/<name>`.
- `/usage` scrapes `rate_limits` (5h `primary` + weekly `secondary`) from the newest
  `~/.codex/sessions/**/rollout-*.jsonl` snapshot — pure session-file read.
- On Windows the CLI is a `.cmd` shim, so `spawnCodex` routes through `cmd /C`; override
  the binary with `CODEX_BIN`.

## Dev / deploy

```
npm run dev                          # frontend SPA (Vite, port 5173)
cd worker && npm run dev             # worker (tsx watch)
```
Deploy: `vercel build --prod && vercel deploy --prebuilt --prod` (frontend);
`cd worker && railway up` (worker). Railway account token goes in `RAILWAY_API_TOKEN`
(unset `RAILWAY_TOKEN` first — an empty value there is treated as an invalid project token).
A first admin must be promoted manually (`update profiles set role='admin'` via SQL).

## Maintaining this file

Keep this file current. After any prompt that changes the app — new/renamed
commands, components, events, data shapes, deps, or build steps — update the
relevant section here in the same turn, before finishing. Keep it short: structure
and behavior, not line-by-line detail.
