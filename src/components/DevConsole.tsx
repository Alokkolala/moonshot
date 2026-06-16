import { useEffect, useRef, useState } from "react";
import { Terminal, Trash2, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DevChannel, DevLogEntry } from "@/types";

interface Props {
  entries: DevLogEntry[];
  onClear: () => void;
}

const CHANNEL_STYLE: Record<DevChannel, string> = {
  prompt: "text-primary border-primary/30 bg-primary/5",
  reply: "text-foreground border-border bg-card/60",
  event: "text-muted-foreground border-border/60 bg-transparent",
  image: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  error: "text-destructive border-destructive/40 bg-destructive/5",
  done: "text-muted-foreground border-border/60 bg-transparent",
  info: "text-muted-foreground border-border/60 bg-transparent",
};

export function DevConsole({ entries, onClear }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [autoscroll, setAutoscroll] = useState(true);

  useEffect(() => {
    if (autoscroll) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, autoscroll]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Terminal className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Dev console</p>
            <p className="text-xs text-muted-foreground">
              Every prompt and raw Codex event · {entries.length} entries
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
              className="accent-primary"
            />
            Auto-scroll
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClear}
            disabled={entries.length === 0}
            className="gap-1.5 rounded-lg"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground/70">
            No Codex activity yet — generate an outline to see prompts here.
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((e) => {
              const isOpen = open[e.id] ?? false;
              const hasBody = !!e.body;
              return (
                <div
                  key={e.id}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5",
                    CHANNEL_STYLE[e.channel]
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      hasBody && setOpen((o) => ({ ...o, [e.id]: !isOpen }))
                    }
                    className="flex w-full items-center gap-2 text-left"
                  >
                    {hasBody ? (
                      <ChevronRight
                        className={cn(
                          "size-3 shrink-0 transition-transform",
                          isOpen && "rotate-90"
                        )}
                      />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <span className="shrink-0 tabular-nums opacity-50">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                    <span className="shrink-0 rounded bg-background/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-80">
                      {e.channel}
                    </span>
                    <span className="truncate font-sans">{e.title}</span>
                  </button>
                  {hasBody && isOpen && (
                    <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/40 p-2.5 text-[11px] leading-relaxed text-foreground/90">
                      {e.body}
                    </pre>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
