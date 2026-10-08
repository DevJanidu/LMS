"use client";

import { useId, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import Label from "@/components/form/Label";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "step"> & { label: string; step?: string | number };

function stringValue(value: unknown) { return value === undefined || value === null ? "" : String(value); }

/** Numeric input with a compact, touch-friendly stepper that stays form-compatible. */
export default function NumberInput({ label, id: suppliedId, value, defaultValue, min, max, step = 1, name, disabled, onChange, className = "", ...props }: Props) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [internal, setInternal] = useState(stringValue(defaultValue));
  const current = value === undefined ? internal : stringValue(value);
  const numericStep = Number(step) || 1;
  const emit = (next: string) => {
    setInternal(next);
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLInputElement>);
  };
  const increment = (direction: 1 | -1) => {
    const number = Number(current);
    const base = Number.isFinite(number) ? number : Number(min ?? 0);
    let next = base + direction * numericStep;
    if (min !== undefined) next = Math.max(next, Number(min));
    if (max !== undefined) next = Math.min(next, Number(max));
    emit(String(Number(next.toFixed(6))));
  };
  return <div>
    <Label htmlFor={id}>{label}</Label>
    <div className="relative flex h-11 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-theme-xs transition duration-150 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900">
      <input {...props} id={id} name={name} type="number" min={min} max={max} step={step} disabled={disabled} value={current} onChange={event => emit(event.target.value)} className={`min-w-0 flex-1 appearance-none bg-transparent px-4 text-body text-primary outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary dark:placeholder:text-white/30 ${className}`} />
      <div className="flex w-9 shrink-0 flex-col border-s border-gray-200 dark:border-gray-700">
        <button type="button" tabIndex={-1} aria-label="Increase value" disabled={disabled} onClick={() => increment(1)} className="flex flex-1 items-center justify-center text-caption text-muted transition hover:bg-gray-100 hover:text-brand-600 disabled:opacity-40 dark:text-secondary dark:hover:bg-gray-800 dark:hover:text-brand-300">+</button>
        <button type="button" tabIndex={-1} aria-label="Decrease value" disabled={disabled} onClick={() => increment(-1)} className="flex flex-1 items-center justify-center border-t border-gray-200 text-caption text-muted transition hover:bg-gray-100 hover:text-brand-600 disabled:opacity-40 dark:border-gray-700 dark:text-secondary dark:hover:bg-gray-800 dark:hover:text-brand-300">−</button>
      </div>
    </div>
  </div>;
}
