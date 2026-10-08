"use client";

import { Children, isValidElement, useId, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import Label from "@/components/form/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & { label: string; children: ReactNode };
type Option = { value: string; label: ReactNode; disabled?: boolean };

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child) || child.type !== "option") return [];
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    return [{ value: String(props.value ?? ""), label: props.children, disabled: props.disabled }];
  });
}

/** Radix select that preserves this application's native form and onChange contract. */
export default function SelectField({ label, children, value, defaultValue, onChange, name, required, disabled, id: suppliedId }: Props) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const options = readOptions(children);
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = String(value ?? internal);
  return <div className="min-w-0">
    <Label htmlFor={id}>{label}</Label>
    <Select value={current} name={name} required={required} disabled={disabled} open={open} onOpenChange={next => {
      if (next) setPortalContainer(triggerRef.current?.closest("dialog") ?? null);
      setOpen(next);
    }} onValueChange={next => {
      setInternal(next);
      onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>);
    }}>
      <SelectTrigger id={id} ref={triggerRef} aria-label={label}><SelectValue placeholder="Select an option" /></SelectTrigger>
      <SelectContent container={portalContainer} aria-label={label}>
        {options.map((option, index) => <SelectItem key={`${option.value}-${index}`} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
