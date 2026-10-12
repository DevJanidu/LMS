"use client";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { deviceTimezone } from "@/lib/timezone";
import { featureRequest } from "@/lib/goals/client";
import { confirmWorkspaceChanges } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
export default function AccountTimezoneSync({
  initial,
}: {
  initial: Workspace;
}) {
  const router = useRouter();
  useEffect(() => {
    if (initial.user.timezoneMode === "manual") return;
    let cancelled = false,
      pending = false;
    const sync = async () => {
      const timezone = deviceTimezone();
      if (
        pending ||
        !timezone ||
        timezone === initial.user.timezone ||
        document.visibilityState !== "visible"
      )
        return;
      pending = true;
      try {
        const result = await featureRequest<{
          changed: boolean;
          timezone: string;
          timezoneMode: "device" | "manual";
          updatedAt: string;
        }>("/api/timezone", { timezone });
        if (
          !cancelled &&
          (result.changed ||
            result.timezone !== initial.user.timezone ||
            result.timezoneMode !== initial.user.timezoneMode)
        ) {
          confirmWorkspaceChanges(
            initial,
            {
              ok: true,
              userUpdatedAt: result.updatedAt,
              changes: {
                profile: {
                  timezone: result.timezone,
                  timezoneMode: result.timezoneMode,
                },
              },
            },
            false,
          );
          router.refresh();
        }
      } catch {
        /* Keep the saved timezone during a transient network failure. */
      } finally {
        pending = false;
      }
    };
    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 60000);
    const focused = () => {
      void sync();
    };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [
    initial.user.id,
    initial.user.timezone,
    initial.user.timezoneMode,
    initial,
    router,
  ]);
  return null;
}
