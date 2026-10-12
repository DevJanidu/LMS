"use client";
import { useTranslations } from "next-intl";
import { BellIcon, CommandIcon, SettingsIcon } from "@/icons";
export type AvenTab = "chat" | "notifications" | "settings";
export default function AvenNavigation({
  tab,
  onChange,
}: {
  tab: AvenTab;
  onChange: (tab: AvenTab) => void;
}) {
  const t = useTranslations("aven");
  const keys = ["chat", "notifications", "settings"] as const;
  const icons = {
    chat: CommandIcon,
    notifications: BellIcon,
    settings: SettingsIcon,
  };
  return (
    <div
      role="tablist"
      aria-label={t("navigation")}
      className="flex items-center gap-1"
    >
      {keys.map((key, index) => {
        const Icon = icons[key],
          label = t(key === "notifications" ? "notificationsTab" : key);
        return (
          <button
            key={key}
            id={`aven-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`aven-${key}`}
            aria-label={label}
            title={label}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(event) => {
              const forward = "ArrowRight", backward = "ArrowLeft";
              const target =
                event.key === forward
                  ? keys[(index + 1) % 3]
                  : event.key === backward
                    ? keys[(index + 2) % 3]
                    : event.key === "Home"
                      ? keys[0]
                      : event.key === "End"
                        ? keys[2]
                        : null;
              if (target) {
                event.preventDefault();
                onChange(target);
                document.getElementById(`aven-tab-${target}`)?.focus();
              }
            }}
            className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 aria-selected:bg-brand-50 aria-selected:text-brand-600 dark:hover:bg-gray-800 dark:aria-selected:bg-brand-950/40 dark:aria-selected:text-brand-300"
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  );
}
