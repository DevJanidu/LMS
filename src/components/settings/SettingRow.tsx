import type { ReactNode } from "react";

interface Props {
  /** Id of the control; the label targets it and its help text is `${id}-help`. */
  id: string;
  label: string;
  description?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  /** Stack the control under the text instead of beside it (wide controls). */
  stacked?: boolean;
  children: ReactNode;
}

/** Label and description on the start side, control on the end side. */
export default function SettingRow({ id, label, description, badge, disabled, stacked, children }: Props) {
  return (
    <div className="sf-set-row" data-disabled={disabled || undefined} data-stacked={stacked || undefined}>
      <div className="sf-set-row-text">
        <label htmlFor={id} id={`${id}-label`} className="sf-set-label">
          {label}
          {badge}
        </label>
        {description && <p id={`${id}-help`} className="sf-set-help">{description}</p>}
      </div>
      <div className="sf-set-row-control">{children}</div>
    </div>
  );
}
