"use client";
import { useTranslations } from "next-intl";
import type { SaveStatus } from "./useBlockState";
/** Quiet, polite status for saved block state; errors are announced. */
export default function SaveIndicator({ status }: { status: SaveStatus }) {
  const t = useTranslations("aven.blocks.save");
  if (status === "idle") return null;
  return (
    <span
      className="aven-save-status"
      data-tone={status}
      role={status === "error" || status === "conflict" ? "alert" : "status"}
    >
      {t(status)}
    </span>
  );
}
