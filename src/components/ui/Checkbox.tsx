"use client";

import * as Primitive from "@radix-ui/react-checkbox";
import type { ComponentProps } from "react";

export function Checkbox({ className = "", ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={`grid size-4 shrink-0 place-items-center rounded border border-gray-300 bg-white text-white shadow-theme-xs outline-none transition focus-visible:ring-3 focus-visible:ring-brand-500/20 data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:data-[state=checked]:border-brand-500 dark:data-[state=checked]:bg-brand-500 ${className}`} {...props}><Primitive.Indicator className="text-current"><svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden="true"><path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></Primitive.Indicator></Primitive.Root>;
}
