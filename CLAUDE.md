# Moonshot

Desktop app that turns a **brand brief into a full AI-generated slide deck**. The user
writes a topic, attaches brand assets (logo / refs / docs) and picks a slide count;
Codex infers the brand, drafts an editable outline, then renders each slide as a PNG.
It wraps the user's locally-installed **Codex CLI** (ChatGPT-subscription auth, no API
key) — everything (brand analysis, planning, rendering) is **driven purely by prompts**,
not Codex tools/functions.

## Stack

- **Tauri 2** (Rust backend) + **React 18** + **Vite 6** + **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **shadcn/ui** (new-york) + Radix primitives
- **motion** (`motion/react`) for animation, **lucide-react** for icons, **jspdf** for PDF export
- Windows, GNU toolchain (no MSVC). **Moonshot** = dark near-black OLED theme;
  **Moonshot Edu** = light "paper + indigo accent" theme (`.theme-edu` class on root).

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

1. **Brief** (`BriefForm`): topic textarea + "Add assets" (file picker → absolute paths)
   + slide-count stepper. "Create outline" runs the outline turn on a **new** Codex thread.
2. Outline turn: `send_message` with the `outlineDirective` (Settings) asks Codex to study
   the asset paths and return **planner JSON** (`{ brand, slides:[{title,brief,notes}] }`).
   `extractJson` parses it; `brand` + outline cards are stored, thread id captured.
3. **Outline** (`OutlineEditor`): editable per-slide cards (title/brief/notes, reorder,
   add, delete) + brand summary. "Generate slides" → `slides` phase + render all.
4. **Slides** (`SlideDeck`): sequential, one PNG per slide, **resuming the same thread**
   so Codex keeps the deck visually consistent (later slides build on earlier ones).
   Per-slide regenerate, save (PNG), reveal-in-folder, lightbox. **Export PDF**
   (header, when ≥1 slide is rendered) builds a one-slide-per-page PDF in the UI via
   `jspdf` (page sized to each PNG; rehydrates any missing data URL via `read_image`)
   and writes it to a chosen path with the `write_file` command.

Rust streams JSONL events + watches `~/.codex/generated_images`, emitting
`codex://event` / `codex://image` / `codex://done` / `codex://error`. Decks persist to
`localStorage` (image/attachment data URLs stripped; disk paths kept); on reopening a
deck, `App` rehydrates rendered slides' data URLs from disk via `read_image`.

Every turn records token usage (from Codex's `turn.completed`) + wall-clock duration as a
`TurnRecord` on `deck.stats`. **Insights** (sidebar nav) aggregates these: total/in/out
tokens, cache-reuse %, total & avg-per-slide time, image count, failures, plus a per-turn
timeline. `SlideDeck`'s header shows a live `tok · time` readout.

Other views (sidebar nav): **Dev console** (every prompt sent + raw Codex events) and
**Settings** (editable `outlineDirective` / `slideDirective`, default slide count, aspect
ratio — persisted to `localStorage`).

## Structure

```
src/
  App.tsx               Root: sidebar + view switch; runOutline / renderSlide orchestration; dev log
  store.ts              useDecks hook — Deck[] + localStorage; uid()
  settings.ts           useSettings hook — editable directives, localStorage
  types.ts              Deck, OutlineSlide, GeneratedSlide, Attachment, Brand, Settings, DevLogEntry, TurnRecord/TurnUsage, CodexEvent…
  lib/codex.ts          runCodexTurn (passes directive) + collectCodexTurn (returns usage + durationMs) + extractJson
  lib/prompts.ts        DEFAULT_*_DIRECTIVE + buildOutlinePrompt / buildSlidePrompt
  lib/utils.ts          cn() helper
  components/
    Sidebar.tsx         View nav (Studio/Insights/Dev/Settings), deck list, usage meter, status + quit
    UsageMeter.tsx      Bottom-left Codex subscription usage (5h + weekly % left), polls codex_usage
    DevConsole.tsx      Prompt + raw-event log, expandable, clear
    InsightsView.tsx    Per-deck Codex stats: token/cache/time cards + turn timeline
    SettingsView.tsx    Edit system-prompt directives + defaults
    studio/
      BriefForm.tsx     Centered brief input, asset picker, slide-count, create-outline
      OutlineEditor.tsx Brand summary + editable/reorderable slide cards
      SlideDeck.tsx     Slide grid, render-all/regenerate, save/reveal, lightbox, export-PDF
    ui/                 shadcn components (button, input, label, textarea, ...)
src-tauri/src/lib.rs    Tauri commands: send_message(prompt, threadId, directive),
                        save_image_as, read_image, write_file, codex_usage, stop_codex,
                        quit_app; codex resolver, image watcher
index.css               Tailwind v4 theme tokens (near-black monochrome dark)
```

The two directives are owned by the **UI/Settings** and passed to `send_message` as the
`directive` arg (the Rust side no longer hardcodes a slide directive).

## Codex CLI notes (Windows)

- `codex` is an npm `.cmd` shim — Rust `Command::new("codex")` can't launch it, so
  `wrap_program`/`find_on_path` route `.cmd`/`.bat` through `cmd /C`. Override with
  `CODEX_BIN` env var.
- `quit_app` kills the Codex process tree (`taskkill /T /F`) then exits the app.
- `codex_usage` reads remaining subscription usage: the CLI records `rate_limits`
  (5h `primary` + weekly `secondary`, `used_percent`/`resets_at`/`plan_type`) into
  each `~/.codex/sessions/**/rollout-*.jsonl`; it scans the newest rollouts for the
  last snapshot. No API/desktop app needed — pure CLI session-file scrape.

## Dev

```
npm run tauri dev      # vite + cargo run (watches src-tauri)
```
Rust changes trigger a rebuild; the running `moonshot.exe` locks build output, so
avoid a second `cargo` process while `tauri dev` is running.

## Maintaining this file

Keep this file current. After any prompt that changes the app — new/renamed
commands, components, events, data shapes, deps, or build steps — update the
relevant section here in the same turn, before finishing. Keep it short: structure
and behavior, not line-by-line detail.
