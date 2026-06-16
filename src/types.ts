// Shared types between the React UI and the Tauri (Rust) Codex bridge.

// ---- App navigation ----

export type View = "studio" | "insights" | "dev" | "settings";

/** Product mode: pitch-deck builder (regular) or education builder (edu). */
export type Mode = "moonshot" | "edu";

/** Where a deck is in the brand → outline → slides workflow. */
export type Phase = "brief" | "outline" | "slides";

// ---- Brand & deck model ----

/** A brand asset (logo / reference image / brand doc) the user attached. We keep
 *  the absolute disk path and hand it to Codex in the prompt so it can read it. */
export interface Attachment {
  id: string;
  name: string;
  path: string;
  /** "image" for logos/refs we can preview, "file" for docs/pdfs/etc. */
  kind: "image" | "file";
  /** data: URL preview for image attachments (not persisted). */
  dataUrl?: string;
}

/** Brand identity Codex infers from the attachments + description. */
export interface Brand {
  name?: string;
  palette?: string[];
  typography?: string;
  tone?: string;
  /** One-paragraph identity summary, applied to every slide prompt. */
  summary?: string;
}

/** One planned slide in the outline (the editable unit). */
export interface OutlineSlide {
  id: string;
  title: string;
  /** One-line layout/content brief: what it shows and how it's laid out. */
  brief: string;
  /** Concrete copy / data points to include on the slide. */
  notes: string;
  /** The specific diagram/visual form for this slide, chosen to fit its idea
   *  and to differ from its neighbours (drives per-slide visual variety). */
  visual?: string;
}

export type SlideStatus = "idle" | "generating" | "done" | "error";

/** The rendered result for one outline slide. */
export interface GeneratedSlide {
  status: SlideStatus;
  /** data: URL of the rendered PNG (not persisted; rehydrated from path). */
  dataUrl?: string;
  /** Absolute path of the rendered PNG on disk. */
  path?: string;
  error?: string;
  updatedAt?: number;
}

// ---- Codex session statistics ----

/** Token usage reported by Codex on `turn.completed`. */
export interface TurnUsage {
  inputTokens: number;
  /** Portion of input served from cache — the payoff of resuming one thread. */
  cachedInputTokens: number;
  outputTokens: number;
}

export type TurnKind = "outline" | "slide";

/** One recorded Codex turn — what it cost in tokens and wall-clock time. */
export interface TurnRecord {
  id: string;
  kind: TurnKind;
  /** Outline title or slide title, for display. */
  label: string;
  ts: number;
  durationMs: number;
  usage: TurnUsage;
  /** Whether the turn produced its expected output (parsed JSON / an image). */
  ok: boolean;
}

/** A full project: brand brief → outline → rendered slides. */
export interface Deck {
  id: string;
  title: string;
  /** Which product this deck belongs to: pitch builder or edu builder. */
  mode: Mode;
  /** Codex thread id, captured from the outline turn and reused for every slide
   *  so Codex keeps the deck visually consistent. */
  threadId: string | null;
  phase: Phase;
  /** The topic / instruction the user typed. */
  brief: string;
  attachments: Attachment[];
  slideCount: number;
  brand: Brand | null;
  outline: OutlineSlide[];
  /** Rendered slide keyed by OutlineSlide.id. */
  slides: Record<string, GeneratedSlide>;
  /** Per-turn Codex usage/timing, appended as outline & slides run. */
  stats: TurnRecord[];
  createdAt: number;
  updatedAt: number;
}

// ---- Codex subscription usage (rate limits) ----

/** One Codex rate-limit window (5-hour or weekly bucket). */
export interface RateWindow {
  /** Percentage of the window already consumed (0–100). */
  usedPercent: number;
  /** Length of the window in minutes (300 = 5h, 10080 = weekly). */
  windowMinutes: number;
  /** Unix seconds at which the window resets. */
  resetsAt: number | null;
}

/** Codex subscription usage scraped from the latest session rollout file. */
export interface CodexUsage {
  primary: RateWindow | null;
  secondary: RateWindow | null;
  planType: string | null;
  timestamp: string | null;
}

// ---- Settings (editable system prompts) ----

export interface Settings {
  /** Directive prefixed to the outline turn (asks Codex for planner JSON). */
  outlineDirective: string;
  /** Directive prefixed to every slide turn (forces built-in PNG image-gen). */
  slideDirective: string;
  /** Edu outline directive — curriculum-aware planner (learning objectives first). */
  eduOutlineDirective: string;
  /** Edu slide directive — pedagogical slide rendering (one idea, analogy, checks). */
  eduSlideDirective: string;
  /** Default number of slides for a new deck. */
  defaultSlideCount: number;
  /** Aspect ratio hint passed to the slide prompt. */
  aspectRatio: string;
}

// ---- Dev console log ----

export type DevChannel =
  | "prompt"
  | "reply"
  | "event"
  | "image"
  | "error"
  | "done"
  | "info";

export interface DevLogEntry {
  id: string;
  ts: number;
  channel: DevChannel;
  deckId?: string;
  /** Short label, e.g. "Outline prompt", "agent_message". */
  title: string;
  body?: string;
}

// ---- Events emitted by the Rust backend (payloads) ----

export interface CodexEventPayload {
  /** The raw JSONL line emitted by `codex exec --json`. */
  line: string;
}

export interface CodexImagePayload {
  path: string;
  dataUrl: string;
}

export interface CodexDonePayload {
  code: number | null;
}

export interface CodexErrorPayload {
  message: string;
}

// ---- Parsed Codex JSONL event shapes (subset we care about) ----

export interface CodexThreadStarted {
  type: "thread.started";
  thread_id: string;
}

export interface CodexItem {
  id: string;
  type: "agent_message" | "command_execution" | "reasoning" | string;
  text?: string;
  command?: string;
  status?: string;
}

export interface CodexItemEvent {
  type: "item.started" | "item.completed" | "item.updated";
  item: CodexItem;
}

export interface CodexTurnEvent {
  type: "turn.started" | "turn.completed" | "turn.failed";
  usage?: Record<string, number>;
  error?: { message?: string };
}

export type CodexEvent =
  | CodexThreadStarted
  | CodexItemEvent
  | CodexTurnEvent
  | { type: string; [k: string]: unknown };
