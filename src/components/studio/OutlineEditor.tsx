import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  RefreshCw,
  Images,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Deck, OutlineSlide } from "@/types";
import { uid } from "@/store";

interface Props {
  deck: Deck;
  busy: boolean;
  status: string;
  onChange: (patch: Partial<Deck>) => void;
  onBack: () => void;
  onRegenerate: () => void;
  onViewSlides: () => void;
  onGenerateSlides: () => void;
}

export function OutlineEditor({
  deck,
  busy,
  status,
  onChange,
  onBack,
  onRegenerate,
  onViewSlides,
  onGenerateSlides,
}: Props) {
  // Whether any slide has already been rendered — lets us jump back to the deck
  // view without re-rendering everything.
  const hasRendered = Object.values(deck.slides).some((s) => s.status === "done");
  const setOutline = (outline: OutlineSlide[]) => onChange({ outline });

  const patchSlide = (id: string, patch: Partial<OutlineSlide>) =>
    setOutline(deck.outline.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const removeSlide = (id: string) =>
    setOutline(deck.outline.filter((s) => s.id !== id));

  const move = (index: number, dir: -1 | 1) => {
    const next = [...deck.outline];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOutline(next);
  };

  const addSlide = () =>
    setOutline([
      ...deck.outline,
      { id: uid(), title: "New slide", brief: "", notes: "", visual: "" },
    ]);

  const brand = deck.brand;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={busy}
            className="gap-1.5 text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Brief
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Outline</p>
            <p className="text-xs text-muted-foreground">
              {deck.outline.length} slides · refine before rendering
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRegenerate}
            disabled={busy}
            className="gap-1.5 rounded-lg"
          >
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
            Regenerate
          </Button>
          {hasRendered && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onViewSlides}
              className="gap-1.5 rounded-lg"
            >
              View slides
              <ArrowRight className="size-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={onGenerateSlides}
            disabled={busy || deck.outline.length === 0}
            className="gap-1.5 rounded-lg"
          >
            <Images className="size-4" />
            {hasRendered ? "Render all again" : "Generate slides"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {/* Brand summary */}
          {brand && (
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {brand.name ?? "Brand identity"}
                </p>
                {brand.palette && brand.palette.length > 0 && (
                  <div className="flex items-center gap-1">
                    {brand.palette.slice(0, 6).map((c, i) => (
                      <span
                        key={i}
                        title={c}
                        className="size-4 rounded-full border border-border/60"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {brand.summary && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {brand.summary}
                </p>
              )}
              {(brand.typography || brand.tone) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {brand.typography && (
                    <span className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      Aa {brand.typography}
                    </span>
                  )}
                  {brand.tone && (
                    <span className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {brand.tone}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Slide cards */}
          <AnimatePresence initial={false}>
            {deck.outline.map((slide, i) => (
              <motion.div
                key={slide.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border border-border bg-card/70 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-medium tabular-nums text-secondary-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <Input
                      value={slide.title}
                      onChange={(e) => patchSlide(slide.id, { title: e.target.value })}
                      placeholder="Slide title"
                      className="h-9 font-medium"
                    />
                    <div className="space-y-1">
                      <Label>Layout brief</Label>
                      <Input
                        value={slide.brief}
                        onChange={(e) =>
                          patchSlide(slide.id, { brief: e.target.value })
                        }
                        placeholder="What the slide shows and how it's laid out"
                        className="h-9 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Visual</Label>
                      <Input
                        value={slide.visual ?? ""}
                        onChange={(e) =>
                          patchSlide(slide.id, { visual: e.target.value })
                        }
                        placeholder="The distinct diagram for this slide (e.g. φ vs r graph, potential well, comparison table)"
                        className="h-9 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Content / notes</Label>
                      <Textarea
                        value={slide.notes}
                        onChange={(e) =>
                          patchSlide(slide.id, { notes: e.target.value })
                        }
                        placeholder="Copy, data points and visuals for this slide"
                        className="min-h-16 rounded-lg border border-border bg-input/30 px-3 py-2 text-[13px]"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={busy || i === deck.outline.length - 1}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlide(slide.id)}
                      disabled={busy}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
                      aria-label="Delete slide"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <Button
            variant="outline"
            onClick={addSlide}
            disabled={busy}
            className="w-full gap-1.5 rounded-xl border-dashed text-muted-foreground"
          >
            <Plus className="size-4" />
            Add slide
          </Button>

          {busy && status && (
            <p className="pb-2 text-center text-sm text-muted-foreground">
              {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
