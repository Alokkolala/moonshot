import { useCallback, useEffect, useState } from "react";
import { Gauge, Coins, X, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchUsage } from "@/lib/api";
import type { CodexUsage, RateWindow } from "@/types";

/** Blended price used to estimate spend from token counts. */
const PRICE_PER_M = 15;

const HIDDEN_KEY = "moonshot.usagemeter.hidden";

interface TokenTotals {
  input: number;
  output: number;
  cached: number;
}

interface Props {
  /** Re-fetch whenever this flips (e.g. a turn just finished). */
  refreshKey?: unknown;
  /** Lifetime token totals across all decks (for the cost view). */
  tokens?: TokenTotals;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Human "resets in 3h 12m" from a unix-seconds timestamp. */
function resetIn(resetsAt: number | null): string {
  if (!resetsAt) return "";
  const secs = resetsAt - Date.now() / 1000;
  if (secs <= 0) return "resetting…";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) return `resets in ${Math.round(h / 24)}d`;
  if (h > 0) return `resets in ${h}h ${m}m`;
  return `resets in ${m}m`;
}

function barColor(used: number): string {
  if (used >= 90) return "bg-destructive";
  if (used >= 70) return "bg-amber-400";
  return "bg-emerald-400";
}

function WindowRow({ label, win }: { label: string; win: RateWindow }) {
  const left = Math.max(0, 100 - win.usedPercent);
  return (
    <div className="space-y-1" title={resetIn(win.resetsAt)}>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground/80">
          {left.toFixed(0)}% left
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={cn("h-full rounded-full transition-all", barColor(win.usedPercent))}
          style={{ width: `${Math.min(100, win.usedPercent)}%` }}
        />
      </div>
    </div>
  );
}

/** A "label … value" stat line matching the WindowRow header style. */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[10.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground/80">{value}</span>
    </div>
  );
}

export function UsageMeter({ refreshKey, tokens }: Props) {
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [hidden, setHidden] = useState(
    () => localStorage.getItem(HIDDEN_KEY) === "1"
  );

  const hide = () => {
    setHidden(true);
    localStorage.setItem(HIDDEN_KEY, "1");
  };
  const reveal = () => {
    setHidden(false);
    localStorage.removeItem(HIDDEN_KEY);
  };

  const refresh = useCallback(() => {
    fetchUsage()
      .then((u) => setUsage(u as CodexUsage | null))
      .catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Re-poll shortly after a turn finishes (rollout file is written on completion).
  useEffect(() => {
    const id = window.setTimeout(refresh, 1500);
    return () => window.clearTimeout(id);
  }, [refreshKey, refresh]);

  const hasUsage = !!(usage?.primary || usage?.secondary);
  const total = tokens ? tokens.input + tokens.output : 0;
  if (!hasUsage && total === 0) return null;

  // $15/M applies to output tokens only.
  const cost = ((tokens?.output ?? 0) / 1_000_000) * PRICE_PER_M;
  const cached = tokens?.cached ?? 0;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={reveal}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-sidebar-border/70 px-2.5 py-1.5 text-[10.5px] text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/40 hover:text-foreground"
      >
        <Eye className="size-3" />
        Show usage
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setShowCost((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setShowCost((v) => !v);
      }}
      title="Click to switch between limits and estimated cost"
      className="group relative w-full cursor-pointer space-y-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/50"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          hide();
        }}
        title="Hide"
        aria-label="Hide usage"
        className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-background/60 hover:text-foreground group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {showCost ? <Coins className="size-3" /> : <Gauge className="size-3" />}
          {showCost ? "Token cost" : "Usage"}
        </span>
        {showCost ? (
          <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground transition-opacity group-hover:opacity-0">
            ${PRICE_PER_M}/M out
          </span>
        ) : (
          usage?.planType && (
            <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground transition-opacity group-hover:opacity-0">
              {usage.planType}
            </span>
          )
        )}
      </div>

      {showCost ? (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] text-muted-foreground">
              Est. spend
            </span>
            <span className="text-base font-semibold tabular-nums">
              ${cost.toFixed(2)}
            </span>
          </div>
          <StatRow label="Total tokens" value={fmtTokens(total)} />
          <StatRow
            label="In / out"
            value={`${fmtTokens(tokens?.input ?? 0)} / ${fmtTokens(
              tokens?.output ?? 0
            )}`}
          />
          {cached > 0 && (
            <StatRow label="Cached" value={fmtTokens(cached)} />
          )}
        </div>
      ) : (
        <>
          {usage?.primary && <WindowRow label="5-hour" win={usage.primary} />}
          {usage?.secondary && <WindowRow label="Weekly" win={usage.secondary} />}
        </>
      )}
    </div>
  );
}
