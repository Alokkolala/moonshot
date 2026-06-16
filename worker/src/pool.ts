import { config } from "./config";
import { runCodexTurn, type CodexHandle } from "./codex";
import { budgetExhausted } from "./usage";
import {
  insertEvent,
  setDeckThread,
  updateTurn,
  uploadSlidePng,
  upsertSlide,
} from "./supabase";

export interface QueuedTurn {
  turnId: string;
  deckId: string;
  userId: string;
  kind: "outline" | "slide";
  prompt: string;
  directive: string;
  threadId: string | null;
  /** For slide turns: the outline slide this render belongs to. */
  outlineId?: string;
}

const queue: QueuedTurn[] = [];
const live = new Map<string, CodexHandle>();

export function enqueue(t: QueuedTurn) {
  queue.push(t);
  pump();
}

export function queuePosition(turnId: string): number {
  return queue.findIndex((q) => q.turnId === turnId);
}

export function stop(turnId: string) {
  live.get(turnId)?.kill();
}

export function stats() {
  return { live: live.size, queued: queue.length, maxConcurrent: config.maxConcurrent };
}

function pump() {
  if (live.size >= config.maxConcurrent || queue.length === 0) return;

  // Budget guardrail: if the weekly window is depleted, hold rather than start a
  // deck we can't finish. Retry shortly; queued turns keep their position.
  if (budgetExhausted()) {
    setTimeout(pump, 60_000);
    return;
  }

  const next = queue.shift()!;
  void runTurn(next);
  if (live.size < config.maxConcurrent) pump(); // fill remaining free slots
}

async function runTurn(t: QueuedTurn) {
  let seq = 0;
  let threadId = t.threadId;
  let usage: unknown = null;
  const startedAt = Date.now();

  await updateTurn(t.turnId, {
    status: "running",
    started_at: new Date().toISOString(),
  });
  if (t.kind === "slide" && t.outlineId) {
    await upsertSlide({
      deckId: t.deckId,
      outlineId: t.outlineId,
      userId: t.userId,
      status: "generating",
    });
  }

  const handle = runCodexTurn(
    { prompt: t.prompt, threadId, directive: t.directive },
    {
      onLine: (ev) => {
        void insertEvent({
          turnId: t.turnId,
          deckId: t.deckId,
          userId: t.userId,
          seq: seq++,
          channel: "event",
          payload: ev,
        });
        if (ev?.type === "thread.started" && ev.thread_id) threadId = ev.thread_id;
        else if (ev?.type === "turn.completed" && ev.usage) usage = ev.usage;
      },

      onImage: async (_p, bytes) => {
        const outlineId = t.outlineId ?? `slide-${seq}`;
        const storagePath = await uploadSlidePng(t.userId, t.deckId, outlineId, bytes);
        await upsertSlide({
          deckId: t.deckId,
          outlineId,
          userId: t.userId,
          status: "done",
          storagePath,
        });
        await insertEvent({
          turnId: t.turnId,
          deckId: t.deckId,
          userId: t.userId,
          seq: seq++,
          channel: "image",
          payload: { storage_path: storagePath },
        });
      },

      onExit: async (code, stderr) => {
        live.delete(t.turnId);
        const ok = code === 0;
        await updateTurn(t.turnId, {
          status: ok ? "done" : "error",
          ok,
          error: ok ? null : stderr.trim() || "Codex exited unexpectedly.",
          thread_id: threadId,
          usage,
          duration_ms: Date.now() - startedAt,
          finished_at: new Date().toISOString(),
        });
        if (threadId) await setDeckThread(t.deckId, threadId);
        if (!ok && t.kind === "slide" && t.outlineId) {
          await upsertSlide({
            deckId: t.deckId,
            outlineId: t.outlineId,
            userId: t.userId,
            status: "error",
            error: stderr.trim() || "render failed",
          });
        }
        await insertEvent({
          turnId: t.turnId,
          deckId: t.deckId,
          userId: t.userId,
          seq: seq++,
          channel: ok ? "done" : "error",
          payload: ok ? { code } : { code, message: stderr.trim() },
        });
        pump(); // free slot → admit the next queued turn
      },
    }
  );

  live.set(t.turnId, handle);

  // Watchdog: a hung turn must not hold its concurrency slot forever.
  setTimeout(() => {
    if (live.has(t.turnId)) handle.kill();
  }, config.turnTimeoutMs);
}
