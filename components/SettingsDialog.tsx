"use client";

import { useEffect, useRef } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; hint: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", hint: "Always use the light theme", Icon: SunIcon },
  { value: "dark", label: "Dark", hint: "Always use the dark theme", Icon: MoonIcon },
  { value: "system", label: "System", hint: "Match this device's setting", Icon: MonitorIcon },
];

interface Props {
  open: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
}

/** Settings panel built on the native <dialog>: focus trapping, Escape and backdrop come with it. */
export default function SettingsDialog({ open, theme, onThemeChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // a click on the dimmed backdrop
      className="m-auto w-[min(92vw,26rem)] rounded-2xl bg-surface p-5 text-foreground shadow-xl ring-1 ring-stone-200 backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="settings-title" className="text-lg font-bold text-teal-900">
          Settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          Close
        </button>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-stone-700">Appearance</legend>
        <div className="mt-2 space-y-2">
          {OPTIONS.map(({ value, label, hint, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-700 ${
                theme === value ? "border-teal-700 bg-teal-50" : "border-stone-300 hover:bg-stone-100"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => onThemeChange(value)}
                className="sr-only"
              />
              <Icon className="size-5 shrink-0 text-teal-700" />
              <span className="flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-stone-500">{hint}</span>
              </span>
              {theme === value && <span className="text-sm font-semibold text-teal-700" aria-hidden="true">✓</span>}
            </label>
          ))}
        </div>
      </fieldset>
    </dialog>
  );
}
