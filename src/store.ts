import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck, Mode } from "./types";
import { supabase } from "./lib/supabase";
import {
  deckToRow,
  rowToDeck,
  rowToSlide,
  rowToTurnRecord,
  type DeckRow,
  type SlideRow,
  type TurnRow,
} from "./lib/mappers";

/** Stable id for client-generated rows (outline slides etc.). */
export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newDeck(slideCount = 6, mode: Mode = "moonshot"): Deck {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Untitled deck",
    mode,
    threadId: null,
    phase: "brief",
    brief: "",
    attachments: [],
    slideCount,
    brand: null,
    outline: [],
    slides: {},
    stats: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Supabase-backed deck store. Decks live in the `decks` table (the browser owns
 * brief + outline editing); slide renders and turn stats are written by the
 * worker and stream back via Realtime. Replaces the desktop's localStorage store.
 */
export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // ---- initial load: this user's decks (RLS scopes the query to them) ----
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("decks")
        .select("*")
        .order("updated_at", { ascending: false });
      if (!alive) return;
      const mapped = (data as DeckRow[] | null)?.map(rowToDeck) ?? [];
      setDecks(mapped);
      setActiveId(mapped[0]?.id ?? "");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- hydrate the active deck's slides + turn stats ----
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    void (async () => {
      const [{ data: slideRows }, { data: turnRows }] = await Promise.all([
        supabase.from("slides").select("*").eq("deck_id", activeId),
        supabase
          .from("turns")
          .select("*")
          .eq("deck_id", activeId)
          .order("created_at", { ascending: true }),
      ]);
      if (!alive) return;
      const slides: Deck["slides"] = {};
      for (const r of (slideRows as SlideRow[] | null) ?? []) {
        slides[r.outline_id] = await rowToSlide(r);
      }
      const stats = ((turnRows as TurnRow[] | null) ?? [])
        .filter((t) => t.status === "done" || t.status === "error")
        .map(rowToTurnRecord);
      if (!alive) return;
      setDecks((prev) =>
        prev.map((d) => (d.id === activeId ? { ...d, slides, stats } : d))
      );
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  // ---- Realtime: merge worker-written slide + turn changes into local state ----
  useEffect(() => {
    const channel = supabase
      .channel("deck-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "slides" },
        async (payload) => {
          const row = payload.new as SlideRow;
          if (!row?.deck_id) return;
          const slide = await rowToSlide(row);
          setDecks((prev) =>
            prev.map((d) =>
              d.id === row.deck_id
                ? { ...d, slides: { ...d.slides, [row.outline_id]: slide } }
                : d
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turns" },
        (payload) => {
          const row = payload.new as TurnRow;
          if (!row?.deck_id || (row.status !== "done" && row.status !== "error")) return;
          const record = rowToTurnRecord(row);
          setDecks((prev) =>
            prev.map((d) => {
              if (d.id !== row.deck_id) return d;
              const stats = d.stats.some((s) => s.id === record.id)
                ? d.stats.map((s) => (s.id === record.id ? record : s))
                : [...d.stats, record];
              return { ...d, stats };
            })
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!decks.find((d) => d.id === activeId) && decks.length) {
      setActiveId(decks[0].id);
    }
  }, [decks, activeId]);

  const active = decks.find((d) => d.id === activeId) ?? decks[0];

  // ---- persist deck-column edits back to Supabase (debounced per deck) ----
  const timers = useRef(new Map<string, number>());
  const persist = useCallback((deck: Deck) => {
    const map = timers.current;
    const existing = map.get(deck.id);
    if (existing) window.clearTimeout(existing);
    map.set(
      deck.id,
      window.setTimeout(() => {
        void supabase.from("decks").update(deckToRow(deck)).eq("id", deck.id);
        map.delete(deck.id);
      }, 400)
    );
  }, []);

  const updateDeck = useCallback(
    (id: string, fn: (d: Deck) => Deck) => {
      setDecks((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          const next = { ...fn(d), updatedAt: Date.now() };
          persist(next);
          return next;
        })
      );
    },
    [persist]
  );

  const createDeck = useCallback((slideCount = 6, mode: Mode = "moonshot") => {
    const d = newDeck(slideCount, mode);
    setDecks((prev) => [d, ...prev]);
    setActiveId(d.id);
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return;
      await supabase.from("decks").insert({ ...deckToRow(d), user_id: userId });
    })();
    return d;
  }, []);

  const deleteDeck = useCallback((id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id));
    void supabase.from("decks").delete().eq("id", id);
  }, []);

  return {
    decks,
    active,
    activeId: active?.id ?? "",
    loading,
    setActiveId,
    createDeck,
    deleteDeck,
    updateDeck,
  };
}

export type DeckStore = ReturnType<typeof useDecks>;
