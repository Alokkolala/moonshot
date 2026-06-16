import { supabase } from "./supabase";
import type { Brand, Deck, GeneratedSlide, OutlineSlide, TurnRecord, TurnUsage } from "../types";

// Maps Supabase rows to the in-memory Deck shape the React components consume.
// Disk paths are gone in the cloud: slide images come from the private `slides`
// bucket as short-lived signed URLs.

export interface DeckRow {
  id: string;
  mode: "moonshot" | "edu";
  title: string;
  brief: string;
  slide_count: number;
  brand: Brand | null;
  outline: OutlineSlide[] | null;
  attachments: { id: string; name: string; storage_path: string; kind: "image" | "file" }[] | null;
  thread_id: string | null;
  phase: "brief" | "outline" | "slides";
  created_at: string;
  updated_at: string;
}

export interface SlideRow {
  deck_id: string;
  outline_id: string;
  status: "idle" | "generating" | "done" | "error";
  storage_path: string | null;
  error: string | null;
  updated_at: string;
}

export interface TurnRow {
  id: string;
  deck_id: string;
  kind: "outline" | "slide";
  label: string;
  status: "queued" | "running" | "done" | "error";
  usage: TurnUsage | null;
  duration_ms: number | null;
  ok: boolean | null;
  created_at: string;
}

/** Base Deck from a row; slides/stats are hydrated separately from Realtime. */
export function rowToDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    threadId: row.thread_id,
    phase: row.phase,
    brief: row.brief,
    attachments: (row.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      path: a.storage_path,
      kind: a.kind,
    })),
    slideCount: row.slide_count,
    brand: row.brand,
    outline: row.outline ?? [],
    slides: {},
    stats: [],
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/** The subset of Deck fields the browser owns and writes back to the decks table. */
export function deckToRow(deck: Deck): Partial<DeckRow> & { id: string } {
  return {
    id: deck.id,
    mode: deck.mode,
    title: deck.title,
    brief: deck.brief,
    slide_count: deck.slideCount,
    brand: deck.brand,
    outline: deck.outline,
    attachments: deck.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      storage_path: a.path,
      kind: a.kind,
    })),
    thread_id: deck.threadId,
    phase: deck.phase,
  };
}

export function rowToTurnRecord(row: TurnRow): TurnRecord {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    ts: Date.parse(row.created_at),
    durationMs: row.duration_ms ?? 0,
    usage: row.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    ok: row.ok ?? false,
  };
}

/** Turn a slide row into a GeneratedSlide, minting a signed URL for the PNG. */
export async function rowToSlide(row: SlideRow): Promise<GeneratedSlide> {
  let dataUrl: string | undefined;
  if (row.storage_path) {
    const { data } = await supabase.storage
      .from("slides")
      .createSignedUrl(row.storage_path, 60 * 60);
    dataUrl = data?.signedUrl;
  }
  return {
    status: row.status,
    dataUrl,
    path: row.storage_path ?? undefined,
    error: row.error ?? undefined,
    updatedAt: Date.parse(row.updated_at),
  };
}
