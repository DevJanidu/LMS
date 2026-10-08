"use client";

import { DatePickerField, TimePickerField } from "@/components/form/DatePickerField";

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
  const [date = "", time = ""] = value.split("T");

  return (
    <fieldset className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40">
      <legend className="px-1 text-h3 text-primary dark:text-primary">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DatePickerField id={`${name}-date`} label={dateLabel} value={date} onChange={(event) => onChange(`${event.target.value}T${time}`)} required />
        </div>
        <div className="min-w-0">
          <TimePickerField id={`${name}-time`} label={timeLabel} value={time} onChange={(next) => onChange(`${date}T${next}`)} />
        </div>
      </div>
    </fieldset>
  );
}
