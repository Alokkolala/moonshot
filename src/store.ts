import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck, Mode } from "./types";

const STORAGE_KEY = "moonshot.decks.v1";

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newDeck(slideCount = 6, mode: Mode = "moonshot"): Deck {
  const now = Date.now();
  return {
    id: uid(),
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

/** Drop heavy in-memory data URLs before persisting; disk paths are kept so the
 *  image can be re-read on demand. */
function serialize(decks: Deck[]): string {
  const lean = decks.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({ ...a, dataUrl: undefined })),
    slides: Object.fromEntries(
      Object.entries(d.slides).map(([k, s]) => [k, { ...s, dataUrl: undefined }])
    ),
  }));
  return JSON.stringify(lean);
}

function load(): Deck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Deck[];
    if (!Array.isArray(parsed)) return [];
    // Migrate decks persisted before a field existed.
    return parsed.map((d) => ({
      ...d,
      stats: d.stats ?? [],
      mode: d.mode ?? "moonshot",
    }));
  } catch {
    return [];
  }
}

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>(() => {
    const loaded = load();
    return loaded.length ? loaded : [newDeck()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = load();
    return loaded.length ? loaded[0].id : "";
  });

  useEffect(() => {
    if (!decks.find((d) => d.id === activeId) && decks.length) {
      setActiveId(decks[0].id);
    }
  }, [decks, activeId]);

  const persistRef = useRef<number | null>(null);
  useEffect(() => {
    if (persistRef.current) window.clearTimeout(persistRef.current);
    persistRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serialize(decks));
      } catch {
        /* quota — ignore */
      }
    }, 250);
  }, [decks]);

  const active = decks.find((d) => d.id === activeId) ?? decks[0];

  const updateDeck = useCallback((id: string, fn: (d: Deck) => Deck) => {
    setDecks((prev) =>
      prev.map((d) => (d.id === id ? { ...fn(d), updatedAt: Date.now() } : d))
    );
  }, []);

  const createDeck = useCallback((slideCount = 6, mode: Mode = "moonshot") => {
    const d = newDeck(slideCount, mode);
    setDecks((prev) => [d, ...prev]);
    setActiveId(d.id);
    return d;
  }, []);

  const deleteDeck = useCallback((id: string) => {
    setDecks((prev) => {
      const next = prev.filter((d) => d.id !== id);
      return next.length ? next : [newDeck()];
    });
  }, []);

  return {
    decks,
    active,
    activeId: active?.id ?? "",
    setActiveId,
    createDeck,
    deleteDeck,
    updateDeck,
  };
}

export type DeckStore = ReturnType<typeof useDecks>;
