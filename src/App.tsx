import { useCallback, useEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Sidebar } from "./components/Sidebar";
import { BriefForm } from "./components/studio/BriefForm";
import { OutlineEditor } from "./components/studio/OutlineEditor";
import { SlideDeck } from "./components/studio/SlideDeck";
import { DevConsole } from "./components/DevConsole";
import { InsightsView } from "./components/InsightsView";
import { SettingsView } from "./components/SettingsView";
import { AdminView } from "./components/AdminView";

import { useDecks, uid } from "./store";
import { useSettings } from "./settings";
import { runCloudTurn, extractJson } from "./lib/codex";
import { stopTurn } from "./lib/api";
import { buildOutlinePrompt, buildSlidePrompt } from "./lib/prompts";
import { useAuth } from "./auth/AuthContext";
import type {
  Brand,
  CodexEvent,
  Deck,
  DevChannel,
  DevLogEntry,
  Mode,
  OutlineSlide,
  View,
} from "./types";

interface OutlineReply {
  brand?: Brand;
  slides?: { title?: string; brief?: string; notes?: string; visual?: string }[];
}

const MAX_LOG = 600;

/** Edu lessons go deeper on one topic — default to a fuller slide count. */
const EDU_DEFAULT_SLIDES = 11;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const decks = useDecks();
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const { isAdmin } = useAuth();
  const { active } = decks;

  const [view, setView] = useState<View>("studio");
  const [mode, setMode] = useState<Mode>("moonshot");
  const [busy, setBusy] = useState(false);

  // Theme the whole document (body bg + tokens) by mode, with a cross-fade.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mode-anim");
    root.classList.toggle("theme-edu", mode === "edu");
  }, [mode]);

  // Follow the active deck's mode when switching decks.
  useEffect(() => {
    if (active?.mode) setMode(active.mode);
  }, [active?.id, active?.mode]);

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
  // The worker turn id currently in flight, so Stop can target it.
  const activeTurnRef = useRef<string | null>(null);

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
      if (event.type === "item.updated") return; // skip noisy reasoning deltas
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

  // ---- Outline generation (fresh Codex thread on the worker) ----
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

      let result;
      try {
        result = await runCloudTurn(
          { deckId: deck.id, prompt, directive, kind: "outline", label: "Outline" },
          {
            onStart: (id) => (activeTurnRef.current = id),
            onEvent: (e) => logEvent(e, deck.id),
            onStatus: setStatus,
          }
        );
      } catch (err) {
        pushLog("error", "Couldn't start outline", errMessage(err), deck.id);
        setStatus(errMessage(err));
        setBusy(false);
        setGeneratingDeckId(null);
        activeTurnRef.current = null;
        return;
      }
      activeTurnRef.current = null;

      if (cancelRef.current) {
        setStatus("Stopped.");
        setBusy(false);
        setGeneratingDeckId(null);
        return;
      }

      if (result.text) pushLog("reply", "Outline reply", result.text, deck.id);
      if (result.error) pushLog("error", "Codex error", result.error, deck.id);

      const parsed = extractJson<OutlineReply>(result.text);
      pushLog("done", "Outline turn complete", undefined, deck.id);

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

      const outline: OutlineSlide[] = parsed.slides.map((sl) => ({
        id: uid(),
        title: sl.title?.trim() || "Untitled slide",
        brief: sl.brief?.trim() || "",
        notes: sl.notes?.trim() || "",
        visual: sl.visual?.trim() || "",
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

  // ---- Render a single slide (the worker resumes the deck's thread) ----
  const renderSlide = useCallback(
    async (deck: Deck, index: number) => {
      const slide = deck.outline[index];
      if (!slide) return;
      setGeneratingId(slide.id);
      // Optimistic — Realtime will confirm/overwrite once the worker starts.
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

      let result;
      try {
        result = await runCloudTurn(
          {
            deckId: deck.id,
            prompt,
            directive,
            kind: "slide",
            outlineId: slide.id,
            label: slide.title || `Slide ${index + 1}`,
          },
          {
            onStart: (id) => (activeTurnRef.current = id),
            onEvent: (e) => logEvent(e, deck.id),
            onImage: () => pushLog("image", `Rendered slide ${index + 1}`, undefined, deck.id),
            onStatus: setStatus,
          }
        );
      } catch (err) {
        decks.updateDeck(deck.id, (d) => ({
          ...d,
          slides: { ...d.slides, [slide.id]: { status: "error", error: errMessage(err) } },
        }));
        pushLog("error", `Slide ${index + 1} failed to start`, errMessage(err), deck.id);
        setGeneratingId(null);
        activeTurnRef.current = null;
        throw err; // let the loop stop
      }
      activeTurnRef.current = null;

      if (cancelRef.current) {
        setGeneratingId(null);
        return;
      }

      pushLog(
        result.error ? "error" : "done",
        `Slide ${index + 1} turn complete`,
        result.error || undefined,
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
      try {
        await renderSlide(deck, index);
      } catch {
        /* surfaced in the slide card */
      }
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
        try {
          await renderSlide(deck, i);
        } catch {
          break; // a hard failure (e.g. quota) — stop the run
        }
      }
      setStatus(cancelRef.current ? "Stopped." : "");
      setBusy(false);
      setGeneratingDeckId(null);
    },
    [busy, renderSlide]
  );

  /** Stop the in-flight generation: kill the worker turn and abort the loop. */
  const stopGeneration = useCallback(() => {
    cancelRef.current = true;
    setStatus("Stopping…");
    const turnId = activeTurnRef.current;
    if (turnId) stopTurn(turnId).catch(() => {});
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
          isAdmin={isAdmin}
        />
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {view === "studio" && renderStudio()}
          {view === "insights" && <InsightsView deck={active ?? null} />}
          {view === "admin" && isAdmin && <AdminView />}
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
