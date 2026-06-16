import {
  BarChart3,
  Coins,
  Clock,
  DatabaseZap,
  Image as ImageIcon,
  Layers,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Deck, TurnRecord } from "@/types";

interface Props {
  deck: Deck | null;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

interface Aggregate {
  turns: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  durationMs: number;
  images: number;
  failures: number;
}

function aggregate(stats: TurnRecord[]): Aggregate {
  return stats.reduce<Aggregate>(
    (a, t) => ({
      turns: a.turns + 1,
      inputTokens: a.inputTokens + t.usage.inputTokens,
      cachedInputTokens: a.cachedInputTokens + t.usage.cachedInputTokens,
      outputTokens: a.outputTokens + t.usage.outputTokens,
      durationMs: a.durationMs + t.durationMs,
      images: a.images + (t.kind === "slide" && t.ok ? 1 : 0),
      failures: a.failures + (t.ok ? 0 : 1),
    }),
    {
      turns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      images: 0,
      failures: 0,
    }
  );
}

export function InsightsView({ deck }: Props) {
  const stats = deck?.stats ?? [];
  const agg = aggregate(stats);
  const totalTokens = agg.inputTokens + agg.outputTokens;
  const cachePct =
    agg.inputTokens > 0
      ? Math.round((agg.cachedInputTokens / agg.inputTokens) * 100)
      : 0;
  const avgSlide =
    agg.images > 0
      ? stats
          .filter((t) => t.kind === "slide" && t.ok)
          .reduce((s, t) => s + t.durationMs, 0) / agg.images
      : 0;
  const maxDuration = stats.reduce((m, t) => Math.max(m, t.durationMs), 0) || 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Insights</p>
            <p className="text-xs text-muted-foreground">
              Codex session usage for{" "}
              {deck ? `“${deck.title}”` : "the active deck"}
            </p>
          </div>
        </div>
      </div>

      {stats.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground/70">
          No session data yet — generate an outline or render slides to see token
          usage and timing here.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto w-full max-w-4xl space-y-7">
            {/* Aggregate cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                icon={Coins}
                label="Total tokens"
                value={fmtTokens(totalTokens)}
                sub={`${fmtTokens(agg.inputTokens)} in · ${fmtTokens(
                  agg.outputTokens
                )} out`}
              />
              <StatCard
                icon={DatabaseZap}
                label="Cache reuse"
                value={`${cachePct}%`}
                sub={`${fmtTokens(agg.cachedInputTokens)} cached input`}
                accent="emerald"
              />
              <StatCard
                icon={Clock}
                label="Total time"
                value={fmtDuration(agg.durationMs)}
                sub={
                  avgSlide ? `${fmtDuration(avgSlide)} avg / slide` : "—"
                }
              />
              <StatCard
                icon={Layers}
                label="Turns"
                value={String(agg.turns)}
                sub={`${agg.images} slide${agg.images === 1 ? "" : "s"} rendered`}
              />
              <StatCard
                icon={ImageIcon}
                label="Images"
                value={String(agg.images)}
                sub="PNG slides produced"
              />
              <StatCard
                icon={agg.failures ? XCircle : CheckCircle2}
                label="Failures"
                value={String(agg.failures)}
                sub={agg.failures ? "turns errored" : "all turns ok"}
                accent={agg.failures ? "destructive" : undefined}
              />
            </div>

            {/* Cache reuse explainer */}
            {agg.cachedInputTokens > 0 && (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-emerald-400">
                  {cachePct}% of input tokens were served from cache.
                </span>{" "}
                Slides resume the deck's single Codex thread, so the brand and
                earlier slides stay in context without being re-sent — cheaper and
                more consistent.
              </p>
            )}

            {/* Per-turn timeline */}
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                Turn timeline
              </h2>
              <div className="space-y-1.5">
                {stats.map((t, i) => (
                  <TurnRow
                    key={t.id}
                    record={t}
                    index={i}
                    widthPct={(t.durationMs / maxDuration) * 100}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub: string;
  accent?: "emerald" | "destructive";
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon
          className={cn(
            "size-3.5",
            accent === "emerald" && "text-emerald-400",
            accent === "destructive" && "text-destructive"
          )}
        />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums tracking-tight",
          accent === "emerald" && "text-emerald-400",
          accent === "destructive" && "text-destructive"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function TurnRow({
  record,
  index,
  widthPct,
}: {
  record: TurnRecord;
  index: number;
  widthPct: number;
}) {
  const tok = record.usage.inputTokens + record.usage.outputTokens;
  const isSlide = record.kind === "slide";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background/60 text-muted-foreground">
        {isSlide ? (
          <ImageIcon className="size-3.5" />
        ) : (
          <FileText className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {index + 1}. {record.label}
          </span>
          {!record.ok && (
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
              failed
            </span>
          )}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/50">
          <div
            className={cn(
              "h-full rounded-full",
              record.ok ? "bg-primary/70" : "bg-destructive/60"
            )}
            style={{ width: `${Math.max(widthPct, 3)}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-xs font-medium">{fmtDuration(record.durationMs)}</p>
        <p className="text-[10.5px] text-muted-foreground">
          {fmtTokens(tok)} tok
        </p>
      </div>
    </div>
  );
}
