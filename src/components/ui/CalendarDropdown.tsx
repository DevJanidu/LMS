"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useDayPicker, type DropdownProps } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";

export default function CalendarDropdown({ options = [], value, onChange, disabled, className, style, id, name, "aria-label": ariaLabel }: DropdownProps) {
  const { dayPickerProps } = useDayPicker();
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return <Select
    value={value === undefined ? undefined : String(value)}
    disabled={disabled}
    dir={dayPickerProps.dir === "rtl" ? "rtl" : "ltr"}
    onOpenChange={open => {
      if (open) setContainer(trigger.current?.closest("dialog") ?? null);
    }}
    onValueChange={next => onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>)}
  >
    <SelectTrigger ref={trigger} compact id={id} name={name} aria-label={ariaLabel} style={style} className={`h-8 !min-h-8 w-auto min-w-0 text-small ${className ?? ""}`}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent container={container} compact sideOffset={4} collisionPadding={8} viewportClassName="custom-scrollbar overscroll-contain touch-pan-y">
      {options.map(option => <SelectItem
        key={option.value}
        compact
        value={String(option.value)}
        disabled={option.disabled}
        className="text-small data-[state=checked]:bg-brand-50 data-[state=checked]:text-brand-700 dark:data-[state=checked]:bg-brand-950/50 dark:data-[state=checked]:text-brand-200"
      >{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
