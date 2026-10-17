"use client";
import { useCallback, useRef, useState } from "react";
import { featureRequest } from "@/lib/goals/client";
import type { ModelOption, ModelSettings } from "@/lib/aven/model-options";
/**
 * The student's model controls. Changes apply immediately to the next message, are saved
 * to their preferences (so they survive refreshes and new conversations), and roll back if
 * the save fails. An unavailable model or a reasoning mode the model cannot honour is
 * never kept selected.
 */
export function normalizeSettings(settings: ModelSettings, options: ModelOption[]): ModelSettings {
  const model =
    options.find((option) => option.key === settings.model && option.available) ??
    options.find((option) => option.available);
  if (!model) return settings;
  return {
    ...settings,
    model: model.key,
    reasoning: model.modes.includes(settings.reasoning) ? settings.reasoning : "auto",
  };
}
export function useModelSettings(initial: ModelSettings, options: ModelOption[]) {
  const [settings, setSettings] = useState(() => normalizeSettings(initial, options)),
    [error, setError] = useState(false);
  const saved = useRef(settings),
    latest = useRef(settings),
    version = useRef(0);
  const update = useCallback(
    (change: Partial<ModelSettings>) => {
      const next = normalizeSettings({ ...latest.current, ...change }, options);
      latest.current = next;
      setSettings(next);
      setError(false);
      const mine = ++version.current;
      void featureRequest("/api/aven", { kind: "modelSettings", ...next })
        .then(() => {
          if (mine === version.current) saved.current = next;
        })
        .catch(() => {
          // Only the latest change rolls back; an older failure must not undo a newer choice.
          if (mine !== version.current) return;
          latest.current = saved.current;
          setSettings(saved.current);
          setError(true);
        });
    },
    [options],
  );
  return { settings, update, error };
}
