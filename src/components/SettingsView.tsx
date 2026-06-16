import { useState } from "react";
import { Settings2, RotateCcw, Sparkles, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Mode, Settings } from "@/types";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
}

const TABS: { id: Mode; label: string; icon: typeof Sparkles }[] = [
  { id: "moonshot", label: "Moonshot", icon: Sparkles },
  { id: "edu", label: "Moonshot Edu", icon: GraduationCap },
];

export function SettingsView({ settings, onChange, onReset }: Props) {
  const [tab, setTab] = useState<Mode>("moonshot");
  const edu = tab === "edu";

  const outlineKey = edu ? "eduOutlineDirective" : "outlineDirective";
  const slideKey = edu ? "eduSlideDirective" : "slideDirective";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Settings2 className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Settings</p>
            <p className="text-xs text-muted-foreground">
              System prompts that steer Codex — all behaviour is prompt-driven
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onReset}
          className="gap-1.5 rounded-lg"
        >
          <RotateCcw className="size-3.5" />
          Reset to defaults
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-7">
          {/* Mode tabs — each product has its own directive pair */}
          <div className="inline-flex rounded-lg border border-border bg-input/30 p-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          <section className="space-y-2">
            <div>
              <h2 className="text-sm font-medium">Outline directive</h2>
              <p className="text-xs text-muted-foreground">
                {edu
                  ? "Prepended to the edu outline turn. Tells Codex to plan a curriculum lesson (objectives first, one idea per slide, analogies, checks)."
                  : "Prepended to the outline turn. Tells Codex to study the brand assets and return the planner JSON Moonshot parses into cards."}
              </p>
            </div>
            <Textarea
              value={settings[outlineKey]}
              onChange={(e) => onChange({ [outlineKey]: e.target.value })}
              className="min-h-56 rounded-xl border border-border bg-input/30 px-4 py-3 font-mono text-[12.5px] leading-relaxed"
              spellCheck={false}
            />
          </section>

          <section className="space-y-2">
            <div>
              <h2 className="text-sm font-medium">Slide directive</h2>
              <p className="text-xs text-muted-foreground">
                {edu
                  ? "Prepended to every edu slide turn. Renders for learning — one idea, big type, a supporting diagram — and keeps the lesson consistent."
                  : "Prepended to every slide turn. Forces built-in PNG image-gen and enforces visual consistency across the deck."}
              </p>
            </div>
            <Textarea
              value={settings[slideKey]}
              onChange={(e) => onChange({ [slideKey]: e.target.value })}
              className="min-h-48 rounded-xl border border-border bg-input/30 px-4 py-3 font-mono text-[12.5px] leading-relaxed"
              spellCheck={false}
            />
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="count">Default slide count</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={24}
                value={settings.defaultSlideCount}
                onChange={(e) =>
                  onChange({
                    defaultSlideCount: Math.max(
                      1,
                      Math.min(24, Number(e.target.value) || 1)
                    ),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ratio">Aspect ratio</Label>
              <Input
                id="ratio"
                value={settings.aspectRatio}
                onChange={(e) => onChange({ aspectRatio: e.target.value })}
                placeholder="16:9"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
