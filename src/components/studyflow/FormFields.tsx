"use client";
import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
export const controlClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };
/** Template input and label with accessible association. */
export default function Field({ label, ...props }: FieldProps) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={controlClass} {...props}>
        {children}
      </select>
    </div>
  );
}
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
