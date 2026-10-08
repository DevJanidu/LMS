import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";

/** Shared typography and directional treatment for text actions. */
export default function TextLink({
  children,
  className = "",
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`sf-text-link ${className}`}>
      {children}
      <ArrowRightIcon aria-hidden="true" className="size-4 rtl:rotate-180" />
    </Link>
  );
}
