import Image from "next/image";
import { APP_NAME } from "@/lib/constants";

interface Props {
  variant?: "full" | "mark";
  className?: string;
}

/** CSS follows the root theme immediately, including the initial server render. */
export default function BrandLogo({ variant = "full", className = "" }: Props) {
  return (
    <span className={`sf-brand-logo ${variant === "mark" ? "sf-brand-logo-mark" : ""} ${className}`}>
      <Image src="/images/logo/light-logo.png" alt={APP_NAME} width={1536} height={1024} sizes="192px" loading="eager" className="block dark:hidden" />
      <Image src="/images/logo/dark-logo.png" alt={APP_NAME} width={1536} height={1024} sizes="192px" loading="eager" className="hidden dark:block" />
    </span>
  );
}
