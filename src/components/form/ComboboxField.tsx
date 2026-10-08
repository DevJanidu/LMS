"use client";

import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import Label from "@/components/form/Label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";

interface Props { label: string; name: string; defaultValue?: string; value?: string; required?: boolean; disabled?: boolean; options: string[]; onChange?: (event: ChangeEvent<HTMLInputElement>) => void }

/** Searchable timezone selector that also permits valid custom IANA zone values. */
export default function ComboboxField({ label, name, defaultValue = "", value, required, disabled, options, onChange }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const current = value ?? internal;
  const matches = options.filter(option => option.toLowerCase().includes(current.toLowerCase()));
  const update = (next: string) => { setInternal(next); onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLInputElement>); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open && matches[active]) { event.preventDefault(); update(matches[active]); setOpen(false); }
    else if (event.key === "Escape") setOpen(false);
  };
  return <div>
    <Label htmlFor={id}>{label}</Label>
    <Popover open={open} onOpenChange={next => { if (next) setPortalContainer(input.current?.closest("dialog") ?? null); setOpen(next); }}>
      <PopoverAnchor asChild><input ref={input} id={id} name={name} value={current} required={required} disabled={disabled} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={keyDown} onChange={event => { update(event.target.value); setActive(0); setOpen(true); }} className="flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-body text-primary shadow-theme-xs outline-none transition duration-150 placeholder:text-gray-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-primary dark:placeholder:text-white/30" /></PopoverAnchor>
      <PopoverContent container={portalContainer} align="start" onOpenAutoFocus={event => event.preventDefault()} className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-2">
        <div id={`${id}-list`} role="listbox" aria-label={label}>
          {matches.length ? matches.map((option, index) => <button key={option} type="button" role="option" aria-selected={option === current} onMouseEnter={() => setActive(index)} onClick={() => { update(option); setOpen(false); input.current?.focus(); }} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-start text-body transition-colors ${option === current || index === active ? "bg-gray-100 text-primary dark:bg-gray-800 dark:text-primary" : "text-secondary hover:bg-gray-100 dark:text-primary dark:hover:bg-gray-800"}`}>{option}</button>) : <p className="px-3 py-2 text-body text-muted dark:text-secondary" role="status">No matches</p>}
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}
