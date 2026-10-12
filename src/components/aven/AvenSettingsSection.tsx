import type { ReactNode } from "react";
interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}
export default function AvenSettingsSection({
  title,
  description,
  children,
}: Props) {
  return (
    <section className="aven-settings-section">
      <h3 className="text-primary dark:text-primary text-h3">{title}</h3>
      {description && (
        <p className="text-secondary dark:text-secondary mt-1 text-small">
          {description}
        </p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
