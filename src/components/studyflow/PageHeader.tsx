import type { ReactNode } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}
/** A calm heading with one primary action. */
export default function PageHeader({ title, description, action }: Props) {
  return (
    <header className="sf-page-header mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <PageBreadCrumb pageTitle={title} />
        <h1 className="text-h1 text-primary dark:text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-body text-muted dark:text-secondary">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
