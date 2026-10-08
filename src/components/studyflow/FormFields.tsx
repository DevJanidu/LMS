"use client";
import {
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import PremiumSelect from "@/components/form/SelectField";
import NumberInput from "@/components/form/NumberInput";
import { DatePickerField, DateTimePickerField } from "@/components/form/DatePickerField";
export const controlClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-body text-primary shadow-theme-xs outline-none transition duration-150 placeholder:text-gray-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-primary dark:placeholder:text-white/30";
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };
/** Template input and label with accessible association. */
export default function Field({ label, type = "text", ...props }: FieldProps) {
  const id = useId();
  if (type === "date") return <DatePickerField {...props as ComponentProps<typeof DatePickerField>} id={id} label={label} />;
  if (type === "datetime-local") return <DateTimePickerField {...props as ComponentProps<typeof DateTimePickerField>} id={id} label={label} />;
  if (type === "number") return <NumberInput {...props} id={id} label={label} />;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} {...props} />
    </div>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: ComponentProps<typeof PremiumSelect>) {
  return <PremiumSelect label={label} {...props}>{children}</PremiumSelect>;
}
/*
 * The textarea intentionally remains native: unlike option menus, its editing
 * surface benefits from the browser's established keyboard and IME behavior.
 */
export function TextField({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} className={controlClass} rows={4} {...props} />
    </div>
  );
}
