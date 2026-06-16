import { AnimatePresence, motion } from "motion/react";
import {
  Sparkles,
  GraduationCap,
  LayoutTemplate,
  BarChart3,
  Terminal,
  Settings2,
  Shield,
  Plus,
  Trash2,
  LogOut,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { DeckStore } from "@/store";
import type { Deck, Mode, View } from "@/types";
import { UsageMeter } from "./UsageMeter";
import { useAuth } from "@/auth/AuthContext";

interface Props {
  view: View;
  setView: (v: View) => void;
  decks: DeckStore;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  busy: boolean;
  /** Deck that currently owns the in-flight Codex session, if any. */
  generatingDeckId: string | null;
  status: string;
  onNewDeck: () => void;
  isAdmin: boolean;
}

const NAV: { id: View; label: string; icon: typeof LayoutTemplate; adminOnly?: boolean }[] = [
  { id: "studio", label: "Studio", icon: LayoutTemplate },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "admin", label: "Admin", icon: Shield, adminOnly: true },
  { id: "dev", label: "Dev console", icon: Terminal },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const PHASE_LABEL: Record<Deck["phase"], string> = {
  brief: "Brief",
  outline: "Outline",
  slides: "Slides",
};

export function Sidebar({
  view,
  setView,
  decks,
  mode,
  onModeChange,
  busy,
  generatingDeckId,
  status,
  onNewDeck,
  isAdmin,
}: Props) {
  const edu = mode === "edu";
  const { signOut } = useAuth();
  const visibleDecks = decks.decks.filter((d) => d.mode === mode);

  // Total tokens spent across every deck — feeds the usage meter's cost view.
  const tokens = decks.decks.reduce(
    (acc, d) => {
      for (const s of d.stats) {
        acc.input += s.usage.inputTokens;
        acc.output += s.usage.outputTokens;
        acc.cached += s.usage.cachedInputTokens;
      }
      return acc;
    },
    { input: 0, output: 0, cached: 0 }
  );
  return (
    <aside className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand — click to switch product mode */}
      <div className="drag-region flex h-14 items-center px-3">
        <button
          type="button"
          onClick={() => onModeChange(edu ? "moonshot" : "edu")}
          disabled={busy}
          title={edu ? "Switch to Moonshot" : "Switch to Moonshot Edu"}
          className="no-drag group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-sidebar-accent disabled:opacity-50"
        >
          <div className="relative grid size-7 place-items-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={mode}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
                className="grid place-items-center"
              >
                {edu ? (
                  <GraduationCap className="size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="overflow-hidden text-left leading-tight">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={mode}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              >
                <p className="whitespace-nowrap text-sm font-semibold tracking-tight">
                  {edu ? (
                    <>
                      Moonshot
                      <span className="text-primary">.edu</span>
                    </>
                  ) : (
                    "Moonshot"
                  )}
                </p>
                <p className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                  {edu ? "curriculum → lesson" : "brand → deck"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="no-drag space-y-0.5 px-2.5 pt-2">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map(({ id, label, icon: Icon }) => {
          const activeNav = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                activeNav
                  ? "text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {activeNav && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-sidebar-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 size-4" />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Decks */}
      <div className="no-drag mt-4 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Decks
        </span>
        <button
          type="button"
          onClick={onNewDeck}
          disabled={busy}
          title="New deck"
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="no-drag min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5">
        {visibleDecks.map((d) => {
          const activeDeck = view === "studio" && d.id === decks.activeId;
          const deckBusy = d.id === generatingDeckId;
          return (
            <div
              key={d.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                activeDeck
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              <button
                type="button"
                onClick={() => {
                  decks.setActiveId(d.id);
                  setView("studio");
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-1.5">
                  {deckBusy && (
                    <Loader2 className="size-3 shrink-0 animate-spin text-emerald-400" />
                  )}
                  <span className="truncate">{d.title}</span>
                </span>
                <span className="block truncate text-[10.5px] text-muted-foreground">
                  {deckBusy
                    ? "Generating…"
                    : `${PHASE_LABEL[d.phase]} · ${d.slideCount} slides`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => decks.deleteDeck(d.id)}
                disabled={busy}
                title="Delete deck"
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:opacity-0"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="no-drag space-y-2 border-t border-sidebar-border px-3 py-3">
        <UsageMeter refreshKey={busy} tokens={tokens} />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex size-2 shrink-0">
              {busy && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  busy ? "bg-emerald-400" : "bg-muted-foreground/50"
                )}
              />
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {busy ? status || "Working…" : "Idle"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <LogOut className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
