"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/icons";
import Label from "@/components/form/Label";

type Option = { value: string; label: ReactNode; disabled?: boolean };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & { label: string; children: ReactNode };

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child) || child.type !== "option") return [];
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    return [{ value: String(props.value ?? ""), label: props.children, disabled: props.disabled }];
  });
}

function changeEvent(value: string): ChangeEvent<HTMLSelectElement> {
  return { target: { value }, currentTarget: { value } } as ChangeEvent<HTMLSelectElement>;
}

/** Accessible, portaled select that keeps a native value for FormData and forms. */
export default function SelectField({ label, children, value, defaultValue, onChange, name, required, disabled, id: suppliedId, ...props }: Props) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const options = readOptions(children);
  const initial = String(value ?? defaultValue ?? options[0]?.value ?? "");
  const [selected, setSelected] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, options.findIndex(option => option.value === initial)));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  const current = String(value ?? selected);
  const currentOption = options.find(option => option.value === current);
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(320, Math.max(48, options.length * 40 + 8));
      const above = rect.bottom + height > window.innerHeight - 12 && rect.top > height + 12;
      setPosition({ top: above ? rect.top - height : rect.bottom + 6, left: rect.left, width: rect.width, above });
    };
    const frame = requestAnimationFrame(updatePosition);
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { const target = event.target as Node; if (!buttonRef.current?.contains(target) && !(target as Element).closest?.(`#${id}-options`)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [id, open]);

  const choose = (option: Option) => {
    if (option.disabled) return;
    setSelected(option.value);
    setActive(options.indexOf(option));
    onChange?.(changeEvent(option.value));
    setOpen(false);
    buttonRef.current?.focus();
  };
  const move = (direction: 1 | -1) => {
    let index = active;
    for (let count = 0; count < options.length; count++) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) { setActive(index); return; }
    }
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!open) { setPosition(null); setOpen(true); } move(event.key === "ArrowDown" ? 1 : -1); return; }
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); setActive(event.key === "Home" ? 0 : options.length - 1); return; }
    if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); if (options[active]) choose(options[active]); }
  };
  return (
    <div className="relative min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <select {...props} id={id} name={name} required={required} disabled={disabled} value={current} onChange={event => { setSelected(event.target.value); onChange?.(event); }} className="pointer-events-none absolute size-px opacity-0" tabIndex={-1} aria-hidden="true">
        {children}
      </select>
      <button ref={buttonRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} onClick={() => { if (!open) setPosition(null); setOpen(currentOpen => !currentOpen); setActive(Math.max(0, options.findIndex(option => option.value === current))); }} onKeyDown={onKeyDown} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3.5 text-start text-sm text-gray-800 shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-500">
        <span className={currentOption ? "truncate" : "truncate text-gray-400 dark:text-white/30"}>{currentOption?.label ?? "Select an option"}</span>
        <ChevronDownIcon className={`size-4 shrink-0 text-gray-500 transition-transform duration-150 dark:text-gray-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && position && typeof document !== "undefined" && createPortal(
        <div id={`${id}-options`} role="listbox" aria-label={label} className="fixed z-999999 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 text-sm shadow-theme-xl outline-none dark:border-gray-700 dark:bg-gray-dark" style={{ top: position.top, left: position.left, width: position.width }}>
          {options.map((option, index) => <button key={`${option.value}-${index}`} type="button" role="option" aria-selected={option.value === current} disabled={option.disabled} onMouseEnter={() => setActive(index)} onClick={() => choose(option)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-start transition duration-150 ${option.value === current ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/50 dark:text-brand-200" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"} disabled:cursor-not-allowed disabled:opacity-40`}><span className="truncate">{option.label}</span>{option.value === current && <span aria-hidden="true" className="text-brand-600 dark:text-brand-300">✓</span>}</button>)}
        </div>, document.body,
      )}
    </div>
  );
}
