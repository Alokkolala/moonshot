import { supabase } from "./supabase";
import { startTurn, type StartTurnArgs } from "./api";
import type { CodexEvent } from "../types";

// Cloud replacement for the desktop Tauri Codex bridge. The browser enqueues a
// turn on the worker, then watches the `turn_events` table (Supabase Realtime)
// for that turn's streamed events — agent text, rendered images, completion.
// The worker is the sole driver of Codex and the sole writer of turns/slides.

export interface CloudTurnResult {
  turnId: string;
  /** Concatenated agent_message text (the outline planner JSON lives here). */
  text: string;
  /** Thread id captured from thread.started (null when resuming a thread). */
  threadId: string | null;
  /** Storage keys of any PNGs rendered during the turn. */
  imagePaths: string[];
  error: string | null;
}

export interface CloudTurnHooks {
  /** Fired once the turn is enqueued — gives the caller its id (for Stop). */
  onStart?: (turnId: string) => void;
  onEvent?: (event: CodexEvent) => void;
  onImage?: (storagePath: string) => void;
  onStatus?: (status: string) => void;
}

interface EventRow {
  seq: number;
  channel: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueue one Codex turn and resolve once it finishes (done/error). Streams the
 * worker's events through the hooks as they arrive.
 */
export async function runCloudTurn(
  args: StartTurnArgs,
  hooks: CloudTurnHooks = {}
): Promise<CloudTurnResult> {
  const { turnId } = await startTurn(args);
  hooks.onStart?.(turnId);

  const result: CloudTurnResult = {
    turnId,
    text: "",
    threadId: null,
    imagePaths: [],
    error: null,
  };

  const seen = new Set<number>();
  let settle: (() => void) | null = null;
  const finished = new Promise<void>((resolve) => (settle = resolve));

  const apply = (row: EventRow): boolean => {
    if (seen.has(row.seq)) return false;
    seen.add(row.seq);
    if (row.channel === "event") {
      const ev = row.payload as CodexEvent;
      hooks.onEvent?.(ev);
      if (ev.type === "thread.started") {
        const tid = (ev as { thread_id?: string }).thread_id;
        if (tid) result.threadId = tid;
      } else if (ev.type === "item.started") {
        const t = (ev as { item?: { type?: string } }).item?.type;
        if (t === "reasoning") hooks.onStatus?.("Reasoning…");
        else if (t === "command_execution") hooks.onStatus?.("Working…");
      } else if (ev.type === "item.completed") {
        const item = (ev as { item?: { type?: string; text?: string } }).item;
        if (item?.type === "agent_message" && item.text) {
          result.text += (result.text ? "\n" : "") + item.text;
        }
      }
    } else if (row.channel === "image") {
      const path = (row.payload as { storage_path?: string }).storage_path;
      if (path) {
        result.imagePaths.push(path);
        hooks.onImage?.(path);
      }
    } else if (row.channel === "error") {
      result.error =
        (row.payload as { message?: string }).message || "Codex error.";
      return true; // terminal
    } else if (row.channel === "done") {
      return true; // terminal
    }
    return false;
  };

  const channel = supabase
    .channel(`turn-${turnId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "turn_events",
        filter: `turn_id=eq.${turnId}`,
      },
      (payload) => {
        if (apply(payload.new as EventRow)) settle?.();
      }
    )
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      // Catch up on any events inserted before the subscription was live.
      const { data } = await supabase
        .from("turn_events")
        .select("seq, channel, payload")
        .eq("turn_id", turnId)
        .order("seq", { ascending: true });
      let terminal = false;
      for (const row of (data as EventRow[] | null) ?? []) {
        if (apply(row)) terminal = true;
      }
      if (terminal) settle?.();
    });

  await finished;
  await supabase.removeChannel(channel);
  return result;
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
