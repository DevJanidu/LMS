"use client";

import * as Primitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon } from "@/icons";
import type { ComponentProps } from "react";

export const Select = Primitive.Root;
export const SelectGroup = Primitive.Group;
export const SelectValue = Primitive.Value;

export function SelectTrigger({ className = "", compact = false, children, ...props }: ComponentProps<typeof Primitive.Trigger> & { compact?: boolean }) {
  return (
    <Primitive.Trigger className={`flex h-11 w-full items-center justify-between ${compact ? "gap-2 rounded-lg px-2" : "gap-3 rounded-xl px-4"} border border-gray-300 bg-white text-start text-body text-primary shadow-theme-xs outline-none transition duration-150 hover:border-brand-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-primary dark:hover:border-brand-700 ${className}`} {...props}>
      {children}<Primitive.Icon asChild><ChevronDownIcon className="size-4 shrink-0 text-muted dark:text-secondary" /></Primitive.Icon>
    </Primitive.Trigger>
  );
}

export function SelectContent({ className = "", viewportClassName = "", compact = false, children, position = "popper", container, ...props }: ComponentProps<typeof Primitive.Content> & { container?: HTMLElement | null; viewportClassName?: string; compact?: boolean }) {
  const compactHeight = "max-h-[min(15rem,var(--radix-select-content-available-height))]";
  return <Primitive.Portal container={container}><Primitive.Content position={position} sideOffset={6} collisionPadding={12} className={`z-999999 ${compact ? `${compactHeight} p-1` : "max-h-80 p-2"} min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-gray-200 bg-white text-body text-secondary shadow-theme-xl outline-none dark:border-gray-700 dark:bg-gray-dark dark:text-primary ${className}`} {...props}><Primitive.Viewport className={`${compact ? compactHeight : "max-h-80"} overflow-y-auto ${viewportClassName}`}>{children}</Primitive.Viewport></Primitive.Content></Primitive.Portal>;
}

export function SelectItem({ className = "", compact = false, children, ...props }: ComponentProps<typeof Primitive.Item> & { compact?: boolean }) {
  return <Primitive.Item className={`relative flex ${compact ? "min-h-8 py-1 pe-8" : "min-h-10 py-2 pe-9"} w-full cursor-default select-none items-center rounded-lg ps-3 outline-none transition-colors data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 dark:data-[highlighted]:bg-gray-800 dark:data-[highlighted]:text-white ${className}`} {...props}><Primitive.ItemText>{children}</Primitive.ItemText><span className="absolute end-3 flex size-4 items-center justify-center text-brand-600 dark:text-brand-300"><Primitive.ItemIndicator><CheckIcon className="size-4" /></Primitive.ItemIndicator></span></Primitive.Item>;
}
