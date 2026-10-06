import type { SubjectColor } from "@/types";
export const accentClasses: Record<SubjectColor, string> = {
  brand: "bg-brand-500 dark:bg-brand-400",
  success: "bg-success-500 dark:bg-success-400",
  orange: "bg-orange-500 dark:bg-orange-400",
  purple: "bg-theme-purple-500 dark:bg-theme-purple-500",
};
interface Props {
  value: number;
  label: string;
  color?: SubjectColor;
}
/** Labelled calculated percentage using the theme palette. */
export default function ProgressBar({ value, label, color = "brand" }: Props) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
    >
      <div
        className={`h-full rounded-full transition-all ${accentClasses[color]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
