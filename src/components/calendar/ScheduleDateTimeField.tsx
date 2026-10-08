"use client";

import { useId } from "react";
import Label from "@/components/form/Label";
import { controlClass } from "@/components/studyflow/FormFields";

interface Props {
  name: string;
  label: string;
  dateLabel: string;
  timeLabel: string;
  value: string;
  onChange: (value: string) => void;
}

/** A local wall-clock value. Conversion to UTC happens when the form is saved. */
export default function ScheduleDateTimeField({ name, label, dateLabel, timeLabel, value, onChange }: Props) {
  const id = useId();
  const [date = "", time = ""] = value.split("T");

  return (
    <fieldset className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40">
      <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-white">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid min-w-0 gap-3 xsm:grid-cols-[minmax(0,1fr)_minmax(8.5rem,0.6fr)]">
        <div className="min-w-0">
          <Label htmlFor={`${id}-date`} className="text-xs">{dateLabel}</Label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(event) => onChange(`${event.target.value}T${time}`)}
            required
            className={`${controlClass} h-11 min-w-0`}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={`${id}-time`} className="text-xs">{timeLabel}</Label>
          <input
            id={`${id}-time`}
            type="time"
            value={time}
            onChange={(event) => onChange(`${date}T${event.target.value}`)}
            required
            className={`${controlClass} h-11 min-w-0`}
          />
        </div>
      </div>
    </fieldset>
  );
}
