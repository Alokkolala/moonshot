import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CodexEvent,
  CodexImagePayload,
  CodexDonePayload,
  CodexErrorPayload,
  TurnUsage,
} from "../types";

export interface TurnHandlers {
  onEvent: (event: CodexEvent) => void;
  onImage: (image: CodexImagePayload) => void;
  onDone: (done: CodexDonePayload) => void;
  onError: (error: CodexErrorPayload) => void;
}

/**
 * Run one Codex turn. Spawns (or resumes) a `codex exec --json` process in the
 * Rust backend, then streams its JSONL events, generated images, and completion
 * back through the provided handlers. Resolves once the turn is fully finished.
 *
 * `directive` is the instruction text prepended to the prompt (owned by the UI /
 * Settings) — a JSON-planner directive for outlines, an image directive for slides.
 */
export async function runCodexTurn(
  prompt: string,
  threadId: string | null,
  directive: string,
  handlers: TurnHandlers
): Promise<void> {
  const unlisteners: UnlistenFn[] = [];
  let settle: () => void;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const cleanup = async () => {
    for (const u of unlisteners) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
  };

  unlisteners.push(
    await listen<{ line: string }>("codex://event", (e) => {
      const line = e.payload.line.trim();
      if (!line) return;
      try {
        handlers.onEvent(JSON.parse(line) as CodexEvent);
      } catch {
        // Non-JSON line (stderr / banner) — surface as a raw event.
        handlers.onEvent({ type: "raw", line } as CodexEvent);
      }
    })
  );

  unlisteners.push(
    await listen<CodexImagePayload>("codex://image", (e) => {
      handlers.onImage(e.payload);
    })
  );

  unlisteners.push(
    await listen<CodexErrorPayload>("codex://error", (e) => {
      handlers.onError(e.payload);
    })
  );

  unlisteners.push(
    await listen<CodexDonePayload>("codex://done", (e) => {
      handlers.onDone(e.payload);
      void cleanup();
      settle();
    })
  );

  try {
    await invoke("send_message", { prompt, threadId, directive });
  } catch (err) {
    handlers.onError({ message: String(err) });
    await cleanup();
    settle!();
    return;
  }

  return finished;
}

export interface CollectedTurn {
  /** Concatenated agent_message text emitted during the turn. */
  text: string;
  /** Thread id captured from thread.started (null when resuming). */
  threadId: string | null;
  images: CodexImagePayload[];
  error: string | null;
  /** Token usage from `turn.completed`, if Codex reported it. */
  usage: TurnUsage | null;
  /** Wall-clock duration of the turn in milliseconds. */
  durationMs: number;
}

/** Normalise Codex's usage object (snake/camel variants) into TurnUsage. */
function readUsage(raw: Record<string, unknown> | undefined): TurnUsage | null {
  if (!raw) return null;
  const pick = (...keys: string[]): number => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return 0;
  };
  return {
    inputTokens: pick("input_tokens", "inputTokens", "prompt_tokens"),
    cachedInputTokens: pick(
      "cached_input_tokens",
      "cachedInputTokens",
      "cache_read_input_tokens"
    ),
    outputTokens: pick("output_tokens", "outputTokens", "completion_tokens"),
  };
}

export interface CollectHooks {
  /** Receives every parsed event, for the dev console / status. */
  onEvent?: (event: CodexEvent) => void;
  onImage?: (image: CodexImagePayload) => void;
}

/**
 * Convenience wrapper that runs a turn and resolves with the aggregated result
 * (agent text, thread id, images, error) — used by the outline/slide flows while
 * still forwarding raw events to the dev console.
 */
export async function collectCodexTurn(
  prompt: string,
  threadId: string | null,
  directive: string,
  hooks: CollectHooks = {}
): Promise<CollectedTurn> {
  let text = "";
  let capturedThread: string | null = null;
  const images: CodexImagePayload[] = [];
  let error: string | null = null;
  let usage: TurnUsage | null = null;
  const startedAt = performance.now();

  await runCodexTurn(prompt, threadId, directive, {
    onEvent: (event) => {
      hooks.onEvent?.(event);
      if (event.type === "thread.started") {
        const tid = (event as { thread_id?: string }).thread_id;
        if (tid) capturedThread = tid;
      } else if (event.type === "item.completed") {
        const item = (event as { item?: { type?: string; text?: string } }).item;
        if (item?.type === "agent_message" && item.text) {
          text += (text ? "\n" : "") + item.text;
        }
      } else if (event.type === "turn.completed") {
        const u = (event as { usage?: Record<string, unknown> }).usage;
        const parsed = readUsage(u);
        if (parsed) usage = parsed;
      }
    },
    onImage: (image) => {
      images.push(image);
      hooks.onImage?.(image);
    },
    onError: (err) => {
      error = err.message;
    },
    onDone: () => {
      /* handled by runCodexTurn settle */
    },
  });

  return {
    text,
    threadId: capturedThread,
    images,
    error,
    usage,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/** Pull the first JSON object out of a Codex reply (tolerates fences/prose). */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
