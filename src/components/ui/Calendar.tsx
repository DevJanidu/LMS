"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import { ChevronDownIcon } from "@/icons";

export function Calendar({ className = "", classNames, ...props }: DayPickerProps) {
  return <DayPicker
    showOutsideDays
    navLayout="around"
    className={`w-full p-3 ${className}`}
    classNames={{
      months: "flex flex-col", month: "space-y-3", month_caption: "relative flex h-8 items-center justify-center",
      caption_label: "text-h3 text-primary dark:text-primary", nav: "flex items-center gap-1",
      button_previous: "absolute start-0 grid size-8 place-items-center rounded-lg text-muted transition hover:bg-gray-100 hover:text-brand-600 dark:text-secondary dark:hover:bg-gray-800 dark:hover:text-brand-300",
      button_next: "absolute end-0 grid size-8 place-items-center rounded-lg text-muted transition hover:bg-gray-100 hover:text-brand-600 dark:text-secondary dark:hover:bg-gray-800 dark:hover:text-brand-300",
      chevron: "size-4", month_grid: "w-full border-collapse", weekdays: "grid grid-cols-7",
      weekday: "py-1 text-center text-overline text-muted dark:text-muted",
      week: "mt-1 grid grid-cols-7", day: "grid place-items-center p-1", day_button: "grid size-9 place-items-center rounded-lg text-body tabular-nums text-secondary outline-none transition hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-primary dark:hover:bg-gray-800",
      today: "text-body-strong text-brand-600 ring-1 ring-brand-300 dark:text-brand-300 dark:ring-brand-700",
      selected: "[&>button]:bg-brand-500 [&>button]:text-body-strong [&>button]:text-white [&>button]:shadow-theme-xs",
      outside: "text-muted dark:text-muted", disabled: "[&>button]:cursor-not-allowed [&>button]:opacity-30",
      ...classNames,
    }}
    components={{ Chevron: ({ orientation, className: iconClass }) => <ChevronDownIcon className={`${iconClass ?? ""} ${orientation === "left" ? "rotate-90" : "-rotate-90"}`} /> }}
    {...props}
  />;
}
