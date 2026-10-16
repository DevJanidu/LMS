"use client";
import * as RadioGroup from "@radix-ui/react-radio-group";

interface Option<T extends string> { value: T; label: string }
interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** A compact single choice; arrow keys move between options (Radix radio group). */
export default function SegmentedControl<T extends string>({ value, options, onChange, ...aria }: Props<T>) {
  return (
    <RadioGroup.Root value={value} onValueChange={next => onChange(next as T)} orientation="horizontal" className="sf-segmented" {...aria}>
      {options.map(option => (
        <RadioGroup.Item key={option.value} value={option.value} className="sf-segment">
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
