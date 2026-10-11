"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/Checkbox";

interface Props {
  weekdays: number[];
  onChange: (weekdays: number[]) => void;
}

const days = [0, 1, 2, 3, 4, 5, 6];

export default function RepeatWeekdays({ weekdays, onChange }: Props) {
  const id = useId();
  const t = useTranslations("studyflow");
  const allSelected = days.every(day => weekdays.includes(day));

  return <fieldset className="space-y-2">
    <legend className="mb-2 text-body text-primary dark:text-primary">{t("weekdays")}</legend>
    <label htmlFor={`${id}-all`} className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-small text-primary dark:text-primary">
      <Checkbox id={`${id}-all`} checked={allSelected} onCheckedChange={checked => onChange(checked === true ? [...days] : [])} className="!aspect-square !h-4 !min-h-0 !min-w-0 !w-4" />
      {t("selectAllDays")}
    </label>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {days.map(day => <label key={day} htmlFor={`${id}-${day}`} className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-small text-primary dark:text-primary">
        <Checkbox
          id={`${id}-${day}`}
          checked={weekdays.includes(day)}
          onCheckedChange={checked => onChange(checked === true ? [...new Set([...weekdays, day])] : weekdays.filter(item => item !== day))}
          className="!aspect-square !h-4 !min-h-0 !min-w-0 !w-4"
        />
        {t(`weekdaysShort.d${day}`)}
      </label>)}
    </div>
  </fieldset>;
}
