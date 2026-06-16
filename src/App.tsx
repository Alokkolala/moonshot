import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Sidebar } from "./components/Sidebar";
import { BriefForm } from "./components/studio/BriefForm";
import { OutlineEditor } from "./components/studio/OutlineEditor";
import { SlideDeck } from "./components/studio/SlideDeck";
import { DevConsole } from "./components/DevConsole";
import { InsightsView } from "./components/InsightsView";
import { SettingsView } from "./components/SettingsView";

import { useDecks, uid } from "./store";
import { useSettings } from "./settings";
import { collectCodexTurn, extractJson } from "./lib/codex";
import { buildOutlinePrompt, buildSlidePrompt } from "./lib/prompts";
import type {
  Brand,
  CodexEvent,
  Deck,
  DevChannel,
  DevLogEntry,
  Mode,
  OutlineSlide,
  TurnKind,
  TurnRecord,
  TurnUsage,
  View,
} from "./types";
import type { CollectedTurn } from "./lib/codex";

interface OutlineReply {
  brand?: Brand;
  slides?: { title?: string; brief?: string; notes?: string; visual?: string }[];
}

const MAX_LOG = 600;

/** Edu lessons go deeper on one topic — default to a fuller slide count. */
const EDU_DEFAULT_SLIDES = 11;

const ZERO_USAGE: TurnUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
};

/** Build a stats record from a collected turn. */
function turnRecord(
  kind: TurnKind,
  label: string,
  result: CollectedTurn,
  ok: boolean
): TurnRecord {
  return {
    id: uid(),
    kind,
    label,
    ts: Date.now(),
    durationMs: result.durationMs,
    usage: result.usage ?? ZERO_USAGE,
    ok,
  };
}

/** Compact "1,234 tok · 3.2s" summary for a dev-log title. */
function turnSummary(result: CollectedTurn): string {
  const u = result.usage;
  const tok = u ? u.inputTokens + u.outputTokens : 0;
  const secs = (result.durationMs / 1000).toFixed(1);
  return `${tok.toLocaleString()} tok · ${secs}s`;
}

export default function App() {
  const decks = useDecks();
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const { active } = decks;

  const [view, setView] = useState<View>("studio");
  const [mode, setMode] = useState<Mode>(() => active?.mode ?? "moonshot");
  const [busy, setBusy] = useState(false);

  // Theme the whole document (body bg + tokens) by mode, with a cross-fade.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mode-anim");
    root.classList.toggle("theme-edu", mode === "edu");
  }, [mode]);
  const [status, setStatus] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  /** Which deck currently owns the single in-flight Codex session (or null). */
  const [generatingDeckId, setGeneratingDeckId] = useState<string | null>(null);
  const [log, setLog] = useState<DevLogEntry[]>([]);

  // Always-current settings for use inside async loops.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Set true to abort an in-flight generation loop (user pressed Stop).
  const cancelRef = useRef(false);

  // Paths we've already rehydrated (or are fetching) — avoids re-reading on every render.
  const rehydratedRef = useRef(new Set<string>());

  // Rehydrate rendered slides after reload: data URLs aren't persisted, so a
  // re-opened deck has done slides with a disk `path` but no `dataUrl` (they'd
  // show as "Queued"). Read each PNG back off disk and patch its data URL in.
  useEffect(() => {
    if (!active) return;
    for (const [slideId, slide] of Object.entries(active.slides)) {
      if (slide.status !== "done" || slide.dataUrl || !slide.path) continue;
      if (rehydratedRef.current.has(slide.path)) continue;
      rehydratedRef.current.add(slide.path);
      const path = slide.path;
      const deckId = active.id;
      invoke<string>("read_image", { path })
        .then((dataUrl) => {
          decks.updateDeck(deckId, (d) => {
            const cur = d.slides[slideId];
            if (!cur || cur.path !== path) return d;
            return { ...d, slides: { ...d.slides, [slideId]: { ...cur, dataUrl } } };
          });
        })
        .catch(() => rehydratedRef.current.delete(path));
    }
  }, [active, decks]);

  const pushLog = useCallback(
    (channel: DevChannel, title: string, body?: string, deckId?: string) => {
      setLog((prev) =>
        [
          ...prev,
          { id: uid(), ts: Date.now(), channel, title, body, deckId },
        ].slice(-MAX_LOG)
      );
    },
    []
  );

  const logEvent = useCallback(
    (event: CodexEvent, deckId: string) => {
      if (event.type === "item.started") {
        const t = (event as { item?: { type?: string } }).item?.type;
        if (t === "reasoning") setStatus("Reasoning…");
        else if (t === "command_execution") setStatus("Working…");
      }
      // Skip noisy reasoning deltas; log structural events only.
      if (event.type === "item.updated") return;
      pushLog("event", event.type, JSON.stringify(event, null, 2), deckId);
    },
    [pushLog]
  );

  const patchActive = useCallback(
    (patch: Partial<Deck>) => {
      if (!active) return;
      decks.updateDeck(active.id, (d) => ({ ...d, ...patch }));
    },
    [active, decks]
  );

  // ---- Outline generation (fresh Codex thread) ----
  const runOutline = useCallback(
    async (deck: Deck) => {
      if (busy) return;
      cancelRef.current = false;
      setBusy(true);
      setGeneratingDeckId(deck.id);
      setStatus("Studying brand & planning the deck…");

      const s = settingsRef.current;
      const directive =
        deck.mode === "edu" ? s.eduOutlineDirective : s.outlineDirective;
      const prompt = buildOutlinePrompt(deck);
      pushLog(
        "prompt",
        "Outline prompt",
        `${directive}\n\n--- USER ---\n\n${prompt}`,
        deck.id
      );

      const result = await collectCodexTurn(prompt, null, directive, {
        onEvent: (e) => logEvent(e, deck.id),
      });

      if (cancelRef.current) {
        setStatus("Stopped.");
        setBusy(false);
        setGeneratingDeckId(null);
        return;
      }

      if (result.text)
        pushLog("reply", "Outline reply", result.text, deck.id);
      if (result.error) pushLog("error", "Codex error", result.error, deck.id);

      const parsed = extractJson<OutlineReply>(result.text);
      const record = turnRecord(
        "outline",
        "Outline",
        result,
        !!parsed?.slides?.length
      );
      decks.updateDeck(deck.id, (d) => ({ ...d, stats: [...d.stats, record] }));
      pushLog("done", `Outline turn · ${turnSummary(result)}`, undefined, deck.id);

      if (!parsed?.slides?.length) {
        pushLog(
          "error",
          "Could not parse outline JSON",
          result.text || result.error || "(empty reply)",
          deck.id
        );
        setStatus("Couldn't parse the outline — check the dev console.");
        setBusy(false);
        setGeneratingDeckId(null);
        return;
      }

      const outline: OutlineSlide[] = parsed.slides.map((s) => ({
        id: uid(),
        title: s.title?.trim() || "Untitled slide",
        brief: s.brief?.trim() || "",
        notes: s.notes?.trim() || "",
        visual: s.visual?.trim() || "",
      }));
      const brand = parsed.brand ?? null;
      const title =
        brand?.name?.trim() ||
        deck.brief.trim().split("\n")[0].slice(0, 40) ||
        "Untitled deck";

      decks.updateDeck(deck.id, (d) => ({
        ...d,
        threadId: result.threadId ?? d.threadId,
        brand,
        outline,
        slides: {},
        phase: "outline",
        title,
      }));
      pushLog("info", `Outline ready · ${outline.length} slides`, undefined, deck.id);
      setStatus("");
      setBusy(false);
      setGeneratingDeckId(null);
    },
    [busy, decks, logEvent, pushLog]
  );

  // ---- Render a single slide (resumes the deck's thread for consistency) ----
  const renderSlide = useCallback(
    async (deck: Deck, index: number) => {
      const slide = deck.outline[index];
      if (!slide) return;
      setGeneratingId(slide.id);
      decks.updateDeck(deck.id, (d) => ({
        ...d,
        slides: { ...d.slides, [slide.id]: { status: "generating" } },
      }));

      const s = settingsRef.current;
      const directive =
        deck.mode === "edu" ? s.eduSlideDirective : s.slideDirective;
      const prompt = buildSlidePrompt(deck, index, s);
      pushLog(
        "prompt",
        `Slide ${index + 1} prompt — ${slide.title}`,
        `${directive}\n\n--- USER ---\n\n${prompt}`,
        deck.id
      );

      const result = await collectCodexTurn(prompt, deck.threadId, directive, {
        onEvent: (e) => logEvent(e, deck.id),
        onImage: (img) =>
          pushLog("image", `Rendered ${img.path}`, undefined, deck.id),
      });

      // User stopped mid-render — drop this slide back to queued, no error card.
      if (cancelRef.current) {
        decks.updateDeck(deck.id, (d) => {
          const next = { ...d.slides };
          delete next[slide.id];
          return { ...d, slides: next };
        });
        setGeneratingId(null);
        return;
      }

      const img = result.images[result.images.length - 1];
      const record = turnRecord(
        "slide",
        slide.title || `Slide ${index + 1}`,
        result,
        !!img
      );
      decks.updateDeck(deck.id, (d) => {
        const next = { ...d.slides };
        if (img) {
          next[slide.id] = {
            status: "done",
            dataUrl: img.dataUrl,
            path: img.path,
            updatedAt: Date.now(),
          };
        } else {
          next[slide.id] = {
            status: "error",
            error: result.error || "Codex produced no image.",
          };
        }
        return { ...d, slides: next, stats: [...d.stats, record] };
      });

      pushLog(
        img ? "done" : "error",
        `Slide ${index + 1} turn · ${turnSummary(result)}`,
        img ? undefined : result.error || result.text || "No image produced.",
        deck.id
      );
      setGeneratingId(null);
    },
    [decks, logEvent, pushLog]
  );

  const runSlide = useCallback(
    async (deck: Deck, index: number) => {
      if (busy) return;
      cancelRef.current = false;
      setBusy(true);
      setGeneratingDeckId(deck.id);
      setStatus(`Rendering slide ${index + 1}…`);
      await renderSlide(deck, index);
      setStatus(cancelRef.current ? "Stopped." : "");
      setBusy(false);
      setGeneratingDeckId(null);
    },
    [busy, renderSlide]
  );

  const runAllSlides = useCallback(
    async (deck: Deck) => {
      if (busy) return;
      cancelRef.current = false;
      setBusy(true);
      setGeneratingDeckId(deck.id);
      for (let i = 0; i < deck.outline.length; i++) {
        if (cancelRef.current) break;
        setStatus(`Rendering slide ${i + 1} of ${deck.outline.length}…`);
        await renderSlide(deck, i);
      }
      setStatus(cancelRef.current ? "Stopped." : "");
      setBusy(false);
      setGeneratingDeckId(null);
    },
    [busy, renderSlide]
  );

  /** Stop the in-flight generation: kill the Codex process and abort the loop. */
  const stopGeneration = useCallback(() => {
    cancelRef.current = true;
    setStatus("Stopping…");
    invoke("stop_codex").catch(() => {});
  }, []);

  const newDeck = useCallback(() => {
    const count =
      mode === "edu" ? EDU_DEFAULT_SLIDES : settingsRef.current.defaultSlideCount;
    decks.createDeck(count, mode);
    setView("studio");
  }, [decks, mode]);

  // Switch product mode: jump to (or start) a deck belonging to that mode.
  const switchMode = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      setMode(m);
      setView("studio");
      const existing = decks.decks.find((d) => d.mode === m);
      if (existing) {
        decks.setActiveId(existing.id);
      } else {
        const count =
          m === "edu" ? EDU_DEFAULT_SLIDES : settingsRef.current.defaultSlideCount;
        decks.createDeck(count, m);
      }
    },
    [mode, decks]
  );

  // ---- Main view ----
  const renderStudio = () => {
    if (!active) return null;
    if (active.phase === "outline") {
      return (
        <OutlineEditor
          deck={active}
          busy={busy}
          status={status}
          onChange={patchActive}
          onBack={() => patchActive({ phase: "brief" })}
          onRegenerate={() => void runOutline(active)}
          onViewSlides={() => patchActive({ phase: "slides" })}
          onGenerateSlides={() => {
            patchActive({ phase: "slides" });
            void runAllSlides(active);
          }}
        />
      );
    }
    if (active.phase === "slides") {
      return (
        <SlideDeck
          deck={active}
          busy={busy}
          generating={generatingDeckId === active.id}
          status={status}
          generatingId={generatingId}
          onBack={() => patchActive({ phase: "outline" })}
          onStop={stopGeneration}
          onGenerateAll={() => void runAllSlides(active)}
          onGenerateSlide={(i) => void runSlide(active, i)}
        />
      );
    }
    return (
      <BriefForm
        deck={active}
        busy={busy}
        status={status}
        onChange={patchActive}
        onGenerate={() => void runOutline(active)}
      />
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid h-screen w-screen grid-cols-[256px_1fr] overflow-hidden bg-background text-foreground">
        <Sidebar
          view={view}
          setView={setView}
          decks={decks}
          mode={mode}
          onModeChange={switchMode}
          busy={busy}
          generatingDeckId={generatingDeckId}
          status={status}
          onNewDeck={newDeck}
        />
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {view === "studio" && renderStudio()}
          {view === "insights" && <InsightsView deck={active ?? null} />}
          {view === "dev" && (
            <DevConsole entries={log} onClear={() => setLog([])} />
          )}
          {view === "settings" && (
            <SettingsView
              settings={settings}
              onChange={updateSettings}
              onReset={resetSettings}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
