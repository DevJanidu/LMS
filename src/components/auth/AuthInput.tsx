"use client";
import { useId, type InputHTMLAttributes } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}
export default function AuthInput({ label, error, ...props }: Props) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input {...props} id={id} error={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <p id={`${id}-error`} className="mt-1 text-small text-error-600 dark:text-error-400">{error}</p>}
    </div>
  );
}
