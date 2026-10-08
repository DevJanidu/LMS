"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/icons";
import Label from "@/components/form/Label";

type CommonProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & { label: string; value?: string; defaultValue?: string; min?: string; max?: string; onChange?: (event: ChangeEvent<HTMLInputElement>) => void };
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (value: number) => String(value).padStart(2, "0");
const today = () => new Date().toISOString().slice(0, 10);
const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, day || 1, 12)); };
const dateValue = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const labelValue = (value: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(parse(value)) : "Select a date";

function eventFor(value: string) { return { target: { value }, currentTarget: { value } } as ChangeEvent<HTMLInputElement>; }

function Calendar({ value, onSelect, min, max }: { value: string; onSelect: (value: string) => void; min?: string; max?: string }) {
  const [month, setMonth] = useState(() => { const date = parse(value || today()); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)); });
  const firstDay = (month.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => index - firstDay + 1);
  return <div className="w-[18.5rem] p-3">
    <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => setMonth(current => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1, 12)))} className="grid size-8 place-items-center rounded-lg text-lg text-gray-500 transition hover:bg-gray-100 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-300">‹</button><p className="text-sm font-semibold text-gray-800 dark:text-white">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</p><button type="button" aria-label="Next month" onClick={() => setMonth(current => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 12)))} className="grid size-8 place-items-center rounded-lg text-lg text-gray-500 transition hover:bg-gray-100 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-300">›</button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{weekdays.map(day => <span key={day} className="py-1">{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map(day => {
      const current = day > 0 && day <= days ? dateValue(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, 12))) : "";
      const isDisabled = !current || Boolean((min && current < min) || (max && current > max));
      const selected = current === value;
      const isToday = current === today();
      return <button key={`${month.toISOString()}-${day}`} type="button" disabled={isDisabled} onClick={() => onSelect(current)} className={`grid size-9 place-items-center rounded-lg text-sm transition duration-150 ${selected ? "bg-brand-500 font-semibold text-white shadow-theme-xs" : isToday ? "font-semibold text-brand-600 ring-1 ring-brand-300 dark:text-brand-300 dark:ring-brand-700" : current ? "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800" : "text-transparent"} disabled:cursor-not-allowed disabled:opacity-25`}>{day > 0 && day <= days ? day : ""}</button>;
    })}</div>
  </div>;
}

type PopoverPosition = { top: number; left: number; above: boolean };
function usePopover(open: boolean, anchor: React.RefObject<HTMLElement | null>, height: number, width: number) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => { const rect = anchor.current?.getBoundingClientRect(); if (!rect) return; const availableWidth = Math.min(width, window.innerWidth - 24); const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - availableWidth - 12)); const above = rect.bottom + height > window.innerHeight - 12 && rect.top > height + 12; setPosition({ top: above ? Math.max(12, rect.top - height) : rect.bottom + 6, left, above }); };
    const frame = requestAnimationFrame(update); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchor, height, open, width]);
  return { position, reset: () => setPosition(null) };
}

export function DatePickerField({ label, name, value, defaultValue, onChange, min, max, disabled, required, id: suppliedId, ...props }: CommonProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { position, reset } = usePopover(open, buttonRef, 390, 296);
  const current = value ?? internal;
  const select = (next: string) => { setInternal(next); onChange?.(eventFor(next)); setOpen(false); buttonRef.current?.focus(); };
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { const target = event.target as Node; if (!buttonRef.current?.contains(target) && !(target as Element).closest?.(`#${id}-calendar`)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } }; document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); }; }, [id, open]);
  return <div className="relative"><Label htmlFor={id}>{label}</Label><input {...props} id={id} name={name} value={current} required={required} disabled={disabled} readOnly tabIndex={-1} className="pointer-events-none absolute size-px opacity-0" aria-hidden="true" /><button ref={buttonRef} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) { reset(); setPortalRoot(buttonRef.current?.closest("dialog") ?? document.body); } setOpen(currentOpen => !currentOpen); }} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3.5 text-start text-sm text-gray-800 shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:border-brand-700"><span className={current ? "" : "text-gray-400 dark:text-white/30"}>{labelValue(current)}</span><ChevronDownIcon className={`size-4 text-gray-500 transition-transform duration-150 dark:text-gray-400 ${open ? "rotate-180" : ""}`} /></button>{open && position && portalRoot && createPortal(<div id={`${id}-calendar`} role="dialog" aria-label={label} className="fixed z-999999 rounded-xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-700 dark:bg-gray-dark" style={{ top: position.top, left: position.left, width: "min(18.5rem, calc(100vw - 1.5rem))" }}><Calendar value={current} onSelect={select} min={min} max={max} /></div>, portalRoot)}</div>;
}

function timeParts(value: string) { const [date, time = "00:00"] = value.split("T"); const [hour, minute] = time.split(":").map(Number); return { date, hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 }; }
function timeLabel(hour: number, minute: number) { return `${pad(hour)}:${pad(minute)}`; }

export function DateTimePickerField({ label, name, value, defaultValue, onChange, min, max, disabled, required, id: suppliedId, ...props }: CommonProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const { position, reset } = usePopover(open, anchor, 520, 296);
  const current = value ?? internal;
  const parts = timeParts(current || `${today()}T09:00`);
  const emit = (next: string) => { setInternal(next); onChange?.(eventFor(next)); };
  const selectDate = (date: string) => emit(`${date}T${timeLabel(parts.hour, parts.minute)}`);
  const selectTime = (hour: number, minute: number) => emit(`${parts.date || today()}T${timeLabel(hour, minute)}`);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { const target = event.target as Node; if (!anchor.current?.contains(target) && !(target as Element).closest?.(`#${id}-datetime`)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); anchor.current?.focus(); } }; document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); }; }, [id, open]);
  return <div className="relative"><Label htmlFor={id}>{label}</Label><input {...props} id={id} name={name} value={current} required={required} disabled={disabled} readOnly tabIndex={-1} className="pointer-events-none absolute size-px opacity-0" aria-hidden="true" /><button ref={anchor} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) { reset(); setPortalRoot(anchor.current?.closest("dialog") ?? document.body); } setOpen(currentOpen => !currentOpen); }} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3.5 text-start text-sm text-gray-800 shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:border-brand-700"><span className={current ? "" : "text-gray-400 dark:text-white/30"}>{current ? `${labelValue(parts.date)} · ${timeLabel(parts.hour, parts.minute)}` : "Select date and time"}</span><ChevronDownIcon className={`size-4 text-gray-500 transition-transform duration-150 dark:text-gray-400 ${open ? "rotate-180" : ""}`} /></button>{open && position && portalRoot && createPortal(<div id={`${id}-datetime`} role="dialog" aria-label={label} className="fixed z-999999 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-700 dark:bg-gray-dark" style={{ top: position.top, left: position.left, width: "min(18.5rem, calc(100vw - 1.5rem))" }}><Calendar value={parts.date || today()} onSelect={selectDate} min={min} max={max} /><div className="border-t border-gray-200 p-3 dark:border-gray-700"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Time</p><div className="grid max-h-36 grid-cols-6 gap-1 overflow-y-auto">{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" onClick={() => selectTime(hour, parts.minute)} className={`rounded-md px-1 py-1.5 text-xs transition ${hour === parts.hour ? "bg-brand-500 text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"}`}>{timeLabel(hour, parts.minute)}</button>)}</div></div></div>, portalRoot)}</div>;
}
