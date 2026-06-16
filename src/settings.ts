import { useCallback, useEffect, useState } from "react";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./lib/prompts";

const STORAGE_KEY = "moonshot.settings.v2";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge so newly-added fields fall back to defaults.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* quota — ignore */
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}
