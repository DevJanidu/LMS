"use client";

import { useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from "react";
import { format, isValid, parse } from "date-fns";
import { ChevronDownIcon } from "@/icons";
import Label from "@/components/form/Label";
import { Calendar } from "@/components/ui/Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";

type CommonProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  label: string; value?: string; defaultValue?: string; min?: string; max?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};
const pad = (n: number) => String(n).padStart(2, "0");
const today = () => format(new Date(), "yyyy-MM-dd");
const parseDate = (value: string) => parse(value, "yyyy-MM-dd", new Date());
const dateLabel = (value: string) => value ? format(parseDate(value), "MMM d, yyyy") : "Select a date";
const eventFor = (value: string) => ({ target: { value }, currentTarget: { value } } as ChangeEvent<HTMLInputElement>);

function DateControl({ value, onSelect, min, max, label }: {
  value: string; onSelect: (value: string) => void; min?: string; max?: string; label: string;
}) {
  const selected = value ? parseDate(value) : undefined;
  const minDate = min ? parseDate(min.slice(0, 10)) : undefined;
  const maxDate = max ? parseDate(max.slice(0, 10)) : undefined;
  return <Calendar
    mode="single"
    selected={selected && isValid(selected) ? selected : undefined}
    onSelect={date => { if (date) onSelect(format(date, "yyyy-MM-dd")); }}
    disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
    aria-label={label}
    className="w-[18.5rem] max-w-[calc(100vw-1.5rem)]"
    modifiersClassNames={{ selected: "bg-brand-500 text-white hover:bg-brand-500 hover:text-white" }}
  />;
}

export function DatePickerField({ label, name, value, defaultValue, onChange, min, max, disabled, required, id: suppliedId, ...props }: CommonProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = value ?? internal;
  const select = (next: string) => { setInternal(next); onChange?.(eventFor(next)); setOpen(false); };
  return <div>
    <Label htmlFor={id}>{label}</Label>
    <input {...props} id={`${id}-value`} name={name} type="date" value={current} min={min} max={max} required={required} disabled={disabled} readOnly tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute size-px opacity-0" />
    <Popover open={open} onOpenChange={next => {
      if (next) setPortalContainer(trigger.current?.closest("dialog") ?? null);
      setOpen(next);
    }}>
      <PopoverTrigger asChild><button ref={trigger} id={id} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-4 text-start text-body text-primary shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-primary dark:hover:border-brand-700"><span className={current ? "" : "text-muted dark:text-primary/30"}>{dateLabel(current)}</span><ChevronDownIcon className="size-4 text-muted dark:text-secondary" /></button></PopoverTrigger>
      <PopoverContent container={portalContainer} align="start" aria-label={label} className="p-0"><DateControl value={current} onSelect={select} min={min} max={max} label={label} /></PopoverContent>
    </Popover>
  </div>;
}

function timeParts(value: string) {
  const [date = "", time = "00:00"] = value.split("T");
  const [hour = "0", minute = "0"] = time.split(":");
  return { date, hour: Math.min(23, Math.max(0, Number(hour) || 0)), minute: Math.min(59, Math.max(0, Number(minute) || 0)) };
}
const timeLabel = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

function TimeSelect({ label, id, value, options, open, onOpenChange, onValueChange, triggerRef, container, disabled }: {
  label: string;
  id: string;
  value: number;
  options: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: number) => void;
  triggerRef: Ref<HTMLButtonElement>;
  container: HTMLElement | null;
  disabled?: boolean;
}) {
  return <Select value={String(value)} open={open} onOpenChange={onOpenChange} onValueChange={next => onValueChange(Number(next))} disabled={disabled}>
    <SelectTrigger compact ref={triggerRef} id={id} aria-label={label} className="min-w-0 flex-1 [&>span:first-child]:flex-1 [&>span:first-child]:text-center">
      <SelectValue />
    </SelectTrigger>
    <SelectContent
      container={container}
      compact
      position="popper"
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      avoidCollisions
      className="w-24"
      viewportClassName="overscroll-contain touch-pan-y"
    >
      {options.map(option => <SelectItem key={option} compact value={String(option)} className="focus-visible:outline-none focus-visible:ring-0 data-[state=checked]:bg-brand-50 data-[state=checked]:text-brand-700 dark:data-[state=checked]:bg-brand-950/50 dark:data-[state=checked]:text-brand-200">{pad(option)}</SelectItem>)}
    </SelectContent>
  </Select>;
}

function TimeSelectors({ hour, minute, onChange, portalContainer }: { hour: number; minute: number; onChange: (hour: number, minute: number) => void; portalContainer: HTMLElement | null }) {
  return <div className="flex items-center gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
    <span className="text-caption text-muted dark:text-secondary">Time</span>
    <Select value={String(hour)} onValueChange={next => onChange(Number(next), minute)}>
      <SelectTrigger aria-label="Hour" className="h-9 w-20 rounded-lg px-3"><SelectValue /></SelectTrigger>
      <SelectContent container={portalContainer} className="max-h-56 min-w-20">{Array.from({ length: 24 }, (_, n) => <SelectItem key={n} value={String(n)}>{pad(n)}</SelectItem>)}</SelectContent>
    </Select>
    <span aria-hidden="true">:</span>
    <Select value={String(minute)} onValueChange={next => onChange(hour, Number(next))}>
      <SelectTrigger aria-label="Minute" className="h-9 w-20 rounded-lg px-3"><SelectValue /></SelectTrigger>
      <SelectContent container={portalContainer} className="max-h-56 min-w-20">{Array.from({ length: 60 }, (_, n) => <SelectItem key={n} value={String(n)}>{pad(n)}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function DateTimePickerField({ label, name, value, defaultValue, onChange, min, max, disabled, required, id: suppliedId, ...props }: CommonProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = value ?? internal;
  const parts = timeParts(current || `${today()}T09:00`);
  const emit = (next: string) => { setInternal(next); onChange?.(eventFor(next)); };
  const selectDate = (date: string) => emit(`${date}T${timeLabel(parts.hour, parts.minute)}`);
  const selectTime = (hour: number, minute: number) => emit(`${parts.date || today()}T${timeLabel(hour, minute)}`);
  return <div>
    <Label htmlFor={id}>{label}</Label>
    <input {...props} id={`${id}-value`} name={name} type="datetime-local" value={current} required={required} disabled={disabled} readOnly tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute size-px opacity-0" />
    <Popover open={open} onOpenChange={next => {
      if (next) setPortalContainer(trigger.current?.closest("dialog") ?? null);
      setOpen(next);
    }}>
      <PopoverTrigger asChild><button ref={trigger} id={id} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-4 text-start text-body text-primary shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-primary dark:hover:border-brand-700"><span className={current ? "" : "text-muted dark:text-primary/30"}>{current ? `${dateLabel(parts.date)} · ${timeLabel(parts.hour, parts.minute)}` : "Select date and time"}</span><ChevronDownIcon className="size-4 text-muted dark:text-secondary" /></button></PopoverTrigger>
      <PopoverContent container={portalContainer} align="start" aria-label={label} className="max-h-[min(34rem,calc(100vh-1.5rem))] overflow-y-auto p-0"><DateControl value={parts.date || today()} onSelect={selectDate} min={min} max={max} label={label} /><TimeSelectors hour={parts.hour} minute={parts.minute} onChange={selectTime} portalContainer={portalContainer} /></PopoverContent>
    </Popover>
  </div>;
}

export function TimePickerField({ label, value, onChange, id: suppliedId, disabled }: { label: string; value: string; onChange: (value: string) => void; id?: string; disabled?: boolean }) {
  const generatedId = useId();
  const [openSelect, setOpenSelect] = useState<"hour" | "minute" | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const hourTrigger = useRef<HTMLButtonElement>(null);
  const minuteTrigger = useRef<HTMLButtonElement>(null);
  const parts = timeParts(`2000-01-01T${value || "00:00"}`);
  const onOpenChange = (kind: "hour" | "minute", next: boolean) => {
    if (next) {
      const trigger = kind === "hour" ? hourTrigger.current : minuteTrigger.current;
      setPortalContainer(trigger?.closest("dialog") ?? null);
    }
    setOpenSelect(next ? kind : null);
  };
  return <div className="min-w-0">
    <Label htmlFor={`${suppliedId ?? generatedId}-hour`}>{label}</Label>
    <div className="flex min-w-0 items-center gap-2">
      <TimeSelect label={`${label} hour`} id={`${suppliedId ?? generatedId}-hour`} value={parts.hour} options={Array.from({ length: 24 }, (_, hour) => hour)} open={openSelect === "hour"} onOpenChange={next => onOpenChange("hour", next)} onValueChange={hour => onChange(timeLabel(hour, parts.minute))} triggerRef={hourTrigger} container={portalContainer} disabled={disabled} />
      <span aria-hidden="true" className="w-2 shrink-0 text-center text-body text-muted dark:text-secondary">:</span>
      <TimeSelect label={`${label} minute`} id={`${suppliedId ?? generatedId}-minute`} value={parts.minute} options={Array.from({ length: 60 }, (_, minute) => minute)} open={openSelect === "minute"} onOpenChange={next => onOpenChange("minute", next)} onValueChange={minute => onChange(timeLabel(parts.hour, minute))} triggerRef={minuteTrigger} container={portalContainer} disabled={disabled} />
    </div>
  </div>;
}
