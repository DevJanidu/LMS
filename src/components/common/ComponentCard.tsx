import { cn } from "@/utils";
import React from "react";

interface ComponentCardProps {
  title: string;
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: string; // Description text
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
}) => {
  return (
    <div
      className={cn(
        "sf-panel min-w-0",
        className,
      )}
    >
      {/* Card Header */}
      <div className="sf-panel-heading px-6 pt-6 pb-4">
        <h3 className="text-h3 text-primary dark:text-primary">
          {title}
        </h3>
        {desc && (
          <p className="mt-1 text-body text-muted dark:text-secondary">
            {desc}
          </p>
        )}
      </div>

      {/* Card Body */}
      <div className="sf-panel-body px-6 pb-6">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
