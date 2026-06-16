import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "motion/react";
import {
  Sparkles,
  GraduationCap,
  Paperclip,
  ImageIcon,
  FileText,
  X,
  Wand2,
  Minus,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Attachment, Deck } from "@/types";
import { uid } from "@/store";

interface Props {
  deck: Deck;
  busy: boolean;
  status: string;
  onChange: (patch: Partial<Deck>) => void;
  onGenerate: () => void;
}

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

function toAttachment(path: string): Attachment {
  const name = path.split(/[\\/]/).pop() ?? path;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return {
    id: uid(),
    name,
    path,
    kind: IMAGE_EXT.includes(ext) ? "image" : "file",
  };
}

export function BriefForm({ deck, busy, status, onChange, onGenerate }: Props) {
  const [picking, setPicking] = useState(false);
  const edu = deck.mode === "edu";

  const addFiles = async () => {
    if (busy) return;
    setPicking(true);
    try {
      const selected = await open({
        multiple: true,
        title: edu ? "Add source material" : "Add brand assets",
        filters: [
          {
            name: edu ? "Source material" : "Brand assets",
            extensions: [...IMAGE_EXT, "pdf", "txt", "md", "doc", "docx"],
          },
        ],
      });
      const paths = Array.isArray(selected)
        ? selected
        : selected
          ? [selected]
          : [];
      if (paths.length) {
        const existing = new Set(deck.attachments.map((a) => a.path));
        const next = [
          ...deck.attachments,
          ...paths.filter((p) => !existing.has(p)).map(toAttachment),
        ];
        onChange({ attachments: next });
      }
    } finally {
      setPicking(false);
    }
  };

  const removeAttachment = (id: string) =>
    onChange({ attachments: deck.attachments.filter((a) => a.id !== id) });

  const setCount = (n: number) =>
    onChange({ slideCount: Math.max(1, Math.min(24, n)) });

  const canGenerate = !busy && deck.brief.trim().length > 0;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-2xl border border-border bg-card shadow-sm">
            {edu ? (
              <GraduationCap className="size-5 text-foreground" />
            ) : (
              <Sparkles className="size-5 text-foreground" />
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {edu ? "Build a lesson from the curriculum" : "Design a deck from a brief"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {edu
              ? "Name one topic and drop in the source material — it plans a clear, student-friendly lesson you can refine."
              : "Describe your presentation and drop in brand assets — it learns the brand and drafts an outline you can refine."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-2.5 shadow-xl backdrop-blur-xl">
          <Textarea
            value={deck.brief}
            onChange={(e) => onChange({ brief: e.target.value })}
            placeholder={
              edu
                ? "e.g. Teach single-slit diffraction to high-school physics students. Assume they know waves but not interference. Friendly and visual."
                : "e.g. A 6-slide investor pitch for a solar-powered drone delivery startup. Confident, optimistic, data-forward."
            }
            className="min-h-28 px-3.5 py-3 text-[15px] leading-relaxed"
            autoFocus
          />

          {deck.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pb-2 pt-1">
              {deck.attachments.map((a) => (
                <span
                  key={a.id}
                  className="group inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border bg-secondary/60 py-1 pl-2 pr-1 text-xs text-secondary-foreground"
                >
                  {a.kind === "image" ? (
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-1 pt-1.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addFiles}
                disabled={busy || picking}
                className="gap-1.5 rounded-lg"
              >
                <Paperclip className="size-3.5" />
                {edu ? "Add material" : "Add assets"}
              </Button>

              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setCount(deck.slideCount - 1)}
                  disabled={busy}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label="Fewer slides"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-14 text-center text-xs tabular-nums text-foreground">
                  {deck.slideCount} slides
                </span>
                <button
                  type="button"
                  onClick={() => setCount(deck.slideCount + 1)}
                  disabled={busy}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label="More slides"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>

            <Button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="gap-1.5 rounded-lg"
            >
              <Wand2 className="size-4" />
              {edu ? "Plan lesson" : "Create outline"}
            </Button>
          </div>
        </div>

        {busy && status && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
            {status}
          </div>
        )}
      </motion.div>
    </div>
  );
}
