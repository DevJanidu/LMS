"use client";
import { useId } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
interface Props {
  label: string;
  options: { id: string; title: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}
export default function GoalLinksField({
  label,
  options,
  value,
  onChange,
}: Props) {
  const id = useId();
  return (
    <fieldset className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <legend className="text-secondary dark:text-secondary px-1 text-small">
        {label}
      </legend>
      <div className="custom-scrollbar max-h-40 space-y-2 overflow-y-auto">
        {options.map((option) => (
          <label
            key={option.id}
            htmlFor={`${id}-${option.id}`}
            className="text-primary dark:text-primary flex cursor-pointer items-center gap-2 text-small"
          >
            <Checkbox
              id={`${id}-${option.id}`}
              className="!min-h-0 !min-w-0"
              checked={value.includes(option.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...new Set([...value, option.id])]
                    : value.filter((item) => item !== option.id),
                )
              }
            />
            <span>{option.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
