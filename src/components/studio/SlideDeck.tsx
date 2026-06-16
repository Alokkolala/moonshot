import { useState, type ReactNode } from "react";
import { jsPDF } from "jspdf";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Images,
  RefreshCw,
  Download,
  FileDown,
  Loader2,
  ImageOff,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Deck, GeneratedSlide, OutlineSlide } from "@/types";

interface Props {
  deck: Deck;
  busy: boolean;
  /** This deck owns the in-flight Codex session (vs. another deck working). */
  generating: boolean;
  status: string;
  generatingId: string | null;
  onBack: () => void;
  onStop: () => void;
  onGenerateAll: () => void;
  onGenerateSlide: (index: number) => void;
}

function slugify(title: string) {
  return title.replace(/[^\w-]+/g, "_").slice(0, 40) || "slide";
}

/** Fetch a (signed-URL) image and convert it to a base64 data URL. */
async function toDataUrl(url: string): Promise<string> {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("image read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Trigger a browser download of a blob under the given filename. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveSlide(slide: GeneratedSlide, title: string) {
  if (!slide.dataUrl) return;
  const blob = await fetch(slide.dataUrl).then((r) => r.blob());
  downloadBlob(blob, `${slugify(title)}.png`);
}

/** Natural pixel dimensions of an image data URL. */
function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

/** Build a one-slide-per-page PDF from every rendered slide and download it. */
async function exportPdf(deck: Deck) {
  const done = deck.outline
    .map((o) => deck.slides[o.id])
    .filter((s): s is GeneratedSlide => s?.status === "done" && !!s.dataUrl);
  if (done.length === 0) return;

  let doc: jsPDF | null = null;
  for (const slide of done) {
    const dataUrl = await toDataUrl(slide.dataUrl!);
    const { w, h } = await imageSize(dataUrl);
    const orientation = w >= h ? "landscape" : "portrait";
    if (!doc) {
      doc = new jsPDF({ orientation, unit: "px", format: [w, h] });
    } else {
      doc.addPage([w, h], orientation);
    }
    doc.addImage(dataUrl, "PNG", 0, 0, w, h);
  }
  if (!doc) return;
  downloadBlob(doc.output("blob"), `${slugify(deck.title)}.pdf`);
}

export function SlideDeck({
  deck,
  busy,
  generating,
  status,
  generatingId,
  onBack,
  onStop,
  onGenerateAll,
  onGenerateSlide,
}: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      await exportPdf(deck);
    } finally {
      setExporting(false);
    }
  };

  const done = deck.outline.filter(
    (s) => deck.slides[s.id]?.status === "done"
  ).length;
  const total = deck.outline.length;

  const tokens = deck.stats.reduce(
    (n, t) => n + t.usage.inputTokens + t.usage.outputTokens,
    0
  );
  const elapsedMs = deck.stats.reduce((n, t) => n + t.durationMs, 0);
  const fmtTok = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const fmtSecs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

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
            Outline
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{deck.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {done}/{total} slides rendered
              </span>
              {tokens > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">{fmtTok(tokens)} tok</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">{fmtSecs(elapsedMs)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {done > 0 && !generating && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void onExport()}
              disabled={busy || exporting}
              className="gap-1.5 rounded-lg"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              Export PDF
            </Button>
          )}
          {generating ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={onStop}
              className="gap-1.5 rounded-lg"
            >
              <Square className="size-3.5 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onGenerateAll}
              disabled={busy}
              className="gap-1.5 rounded-lg"
            >
              <Images className="size-4" />
              {done > 0 ? "Render all again" : "Render all slides"}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-0.5 w-full bg-border/50">
          <motion.div
            className="h-full bg-primary"
            animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
          {deck.outline.map((outline, i) => (
            <SlideTile
              key={outline.id}
              index={i}
              outline={outline}
              slide={deck.slides[outline.id]}
              isGenerating={generatingId === outline.id}
              busy={busy}
              onRegenerate={() => onGenerateSlide(i)}
              onZoom={setLightbox}
            />
          ))}
        </div>
        {busy && status && (
          <p className="py-4 text-center text-sm text-muted-foreground">{status}</p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-8 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <img
            src={lightbox}
            alt="Slide"
            className="max-h-[90vh] max-w-[92vw] rounded-lg border border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function SlideTile({
  index,
  outline,
  slide,
  isGenerating,
  busy,
  onRegenerate,
  onZoom,
}: {
  index: number;
  outline: OutlineSlide;
  slide: GeneratedSlide | undefined;
  isGenerating: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onZoom: (dataUrl: string) => void;
}) {
  const status = isGenerating ? "generating" : slide?.status ?? "idle";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-border bg-card/70"
    >
      <div className="relative aspect-video w-full bg-muted/40">
        {slide?.dataUrl && status !== "generating" ? (
          <button
            type="button"
            onClick={() => slide.dataUrl && onZoom(slide.dataUrl)}
            className="group block size-full"
          >
            <img
              src={slide.dataUrl}
              alt={outline.title}
              className="size-full object-cover transition-opacity group-hover:opacity-90"
            />
          </button>
        ) : status === "generating" ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">Rendering…</span>
          </div>
        ) : status === "error" ? (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 px-4 text-center text-destructive">
            <ImageOff className="size-5" />
            <span className="text-xs">{slide?.error ?? "Render failed"}</span>
          </div>
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground/70">
            Queued
          </div>
        )}

        <span className="absolute left-2.5 top-2.5 grid size-6 place-items-center rounded-md bg-background/70 text-[11px] font-medium tabular-nums backdrop-blur">
          {index + 1}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <p className="truncate text-sm font-medium">{outline.title}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          {slide?.status === "done" && slide.dataUrl && (
            <IconBtn
              title="Save PNG"
              onClick={() => void saveSlide(slide, outline.title)}
            >
              <Download className="size-4" />
            </IconBtn>
          )}
          <IconBtn
            title="Regenerate slide"
            disabled={busy}
            onClick={onRegenerate}
          >
            <RefreshCw
              className={isGenerating ? "size-4 animate-spin" : "size-4"}
            />
          </IconBtn>
        </div>
      </div>
    </motion.div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
